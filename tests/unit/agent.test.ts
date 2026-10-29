import { describe, expect, it } from "vitest";
import { buildTools, runAgent } from "@/lib/agent/run";
import { createFixtureClient } from "@/lib/agent/fixture";
import type { AgentEvent, ContentBlock, Message, MessageParams, ModelClient } from "@/lib/agent/types";
import { parseQuery } from "@/lib/input";
import { makeDraft } from "./fixtures";

const q = (s: string) => {
  const r = parseQuery(s);
  if (!r.ok) throw new Error(r.error);
  return r;
};

function msg(content: unknown[], stop_reason: Message["stop_reason"] = "tool_use"): Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "test",
    content: content as ContentBlock[],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as Message;
}

const submit = (input: unknown, id = "tu_1") => ({ type: "tool_use", id, name: "submit_guide", input });

/** A scripted fake client: each call returns the next response (or throws it). */
function scripted(responses: (Message | Error)[]) {
  const calls: MessageParams[] = [];
  const client: ModelClient = {
    label: "test",
    async createMessage(params, { onBlock }) {
      calls.push(structuredClone(params));
      const r = responses[calls.length - 1];
      if (!r) throw new Error("no more scripted responses");
      if (r instanceof Error) throw r;
      for (const b of r.content) onBlock(b);
      return r;
    },
  };
  return { client, calls };
}

function apiError(status: number) {
  return Object.assign(new Error(`status ${status}`), { status });
}

const events = () => {
  const list: AgentEvent[] = [];
  return { list, emit: (e: AgentEvent) => list.push(e) };
};

describe("buildTools", () => {
  it("offers real web search/fetch server tools and structured output tools", () => {
    const tools = buildTools() as { name: string; type?: string; input_schema?: { type: string } }[];
    expect(tools.find((t) => t.name === "web_search")?.type).toBe("web_search_20250305");
    expect(tools.find((t) => t.name === "web_fetch")?.type).toBe("web_fetch_20250910");
    const submitTool = tools.find((t) => t.name === "submit_guide");
    expect(submitTool?.input_schema?.type).toBe("object");
    expect(JSON.stringify(submitTool)).toContain("approval");
  });
});

describe("runAgent", () => {
  it("returns a guide and records what was searched and retrieved", async () => {
    const ev = events();
    const out = await runAgent(createFixtureClient(), q("Acme Notes"), { emit: ev.emit });
    expect(out.kind).toBe("guide");
    if (out.kind !== "guide") return;
    expect(out.searches).toEqual(["Acme Notes OAuth app developer docs"]);
    expect(out.fetched).toContain("https://example.com/acme/developers/oauth");
    expect(out.searched).toContain("https://example.com/acme/blog");
    expect(out.fetches.find((f) => !f.ok)?.error).toBe("url_not_accessible");
    expect(ev.list.map((e) => e.type)).toEqual(
      expect.arrayContaining(["status", "search", "search_results", "fetch", "fetch_result", "validating"]),
    );
  });

  it("puts the user's query in the user turn, not the system prompt", async () => {
    const { client, calls } = scripted([msg([submit(makeDraft())])]);
    await runAgent(client, q("https://linear.app"), { emit: () => {} });
    expect(String(calls[0].system)).not.toContain("linear.app");
    expect(JSON.stringify(calls[0].messages[0])).toContain("https://linear.app");
  });

  it("reports ambiguity instead of guessing", async () => {
    const out = await runAgent(createFixtureClient(), q("Mercury"), { emit: () => {} });
    expect(out.kind).toBe("ambiguous");
    if (out.kind === "ambiguous") expect(out.report.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("asks the model to repair malformed output, then accepts the fix", async () => {
    const broken = { ...makeDraft(), difficulty: { level: "trivial" }, steps: [] };
    const { client, calls } = scripted([msg([submit(broken, "tu_bad")]), msg([submit(makeDraft(), "tu_good")])]);
    const out = await runAgent(client, q("TestApp"), { emit: () => {} });
    expect(out.kind).toBe("guide");
    const repair = JSON.stringify(calls[1].messages.at(-1));
    expect(repair).toContain("tu_bad");
    expect(repair).toContain("is_error");
    expect(repair).toContain("difficulty.level");
  });

  it("gives up with malformed_output after repeated invalid output", async () => {
    const broken = msg([submit({ appName: 1 })]);
    const { client } = scripted([broken, broken, broken, broken]);
    const out = await runAgent(client, q("TestApp"), { emit: () => {} });
    expect(out).toMatchObject({ kind: "error", code: "malformed_output" });
  });

  it("rejects non-JSON-shaped garbage as malformed", async () => {
    const garbage = msg([{ type: "tool_use", id: "x", name: "submit_guide", input: "not an object" }]);
    const { client } = scripted([garbage, garbage, garbage]);
    expect(await runAgent(client, q("TestApp"), { emit: () => {} })).toMatchObject({ kind: "error", code: "malformed_output" });
  });

  it("nudges once when the model ends without calling a tool", async () => {
    const { client, calls } = scripted([msg([{ type: "text", text: "Here is a summary" }], "end_turn"), msg([submit(makeDraft())])]);
    const out = await runAgent(client, q("TestApp"), { emit: () => {} });
    expect(out.kind).toBe("guide");
    expect(JSON.stringify(calls[1].messages.at(-1))).toMatch(/submit_guide/);
  });

  it("returns no_result when the model never submits", async () => {
    const text = msg([{ type: "text", text: "..." }], "end_turn");
    const { client } = scripted([text, text, text, text]);
    expect(await runAgent(client, q("TestApp"), { emit: () => {} })).toMatchObject({ kind: "error", code: "no_result" });
  });

  it("continues after pause_turn by resending the assistant content", async () => {
    const paused = msg([{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "x" } }], "pause_turn");
    const { client, calls } = scripted([paused, msg([submit(makeDraft())])]);
    const out = await runAgent(client, q("TestApp"), { emit: () => {} });
    expect(out.kind).toBe("guide");
    expect(calls[1].messages.at(-1)?.role).toBe("assistant");
  });

  it.each([
    [401, "auth"],
    [429, "rate_limited"],
    [500, "provider_unavailable"],
    [529, "provider_unavailable"],
    [400, "provider_error"],
  ])("maps provider HTTP %i to %s", async (status, code) => {
    const { client } = scripted([apiError(status)]);
    expect(await runAgent(client, q("TestApp"), { emit: () => {} })).toMatchObject({ kind: "error", code });
  });

  it("maps aborts to timeout", async () => {
    const err = Object.assign(new Error("Request was aborted."), { name: "AbortError" });
    const { client } = scripted([err]);
    expect(await runAgent(client, q("TestApp"), { emit: () => {} })).toMatchObject({ kind: "error", code: "timeout" });
  });

  it("handles a model refusal", async () => {
    const { client } = scripted([msg([], "refusal")]);
    expect(await runAgent(client, q("TestApp"), { emit: () => {} })).toMatchObject({ kind: "error", code: "refused" });
  });

  it("records search errors without crashing", async () => {
    const ev = events();
    const { client } = scripted([
      msg([
        { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "x" } },
        { type: "web_search_tool_result", tool_use_id: "s1", content: { type: "web_search_tool_result_error", error_code: "unavailable" } },
        submit(makeDraft()),
      ]),
    ]);
    const out = await runAgent(client, q("TestApp"), { emit: ev.emit });
    expect(out.kind).toBe("guide");
    expect(ev.list.some((e) => e.type === "status" && /Search failed/.test(e.message))).toBe(true);
  });
});
