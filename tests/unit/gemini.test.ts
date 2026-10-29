import { describe, expect, it } from "vitest";
import { geminiSchema, resolveRedirect, runGeminiAgent, type GeminiLike, type GeminiResponse } from "@/lib/agent/gemini";
import { enforceEvidence, ledgerFrom } from "@/lib/evidence";
import { parseQuery } from "@/lib/input";
import { GuideDraft } from "@/lib/schema";
import type { AgentEvent } from "@/lib/agent/types";
import { makeDraft } from "./fixtures";

const q = (s: string) => {
  const r = parseQuery(s);
  if (!r.ok) throw new Error(r.error);
  return r;
};

const REDIR = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/";
/** Fake fetch that resolves redirect links the way Google's redirector does (302 + Location). */
const fakeFetch = (async (url: string) => {
  const target = String(url).startsWith(REDIR) ? decodeURIComponent(String(url).slice(REDIR.length)) : null;
  return new Response(null, { status: 302, headers: target ? { location: target } : {} });
}) as unknown as typeof fetch;
const redir = (u: string) => REDIR + encodeURIComponent(u);

function researchResponse(text: string): GeminiResponse {
  return {
    text,
    candidates: [
      {
        groundingMetadata: {
          webSearchQueries: ["TestApp OAuth app review"],
          groundingChunks: [
            { web: { uri: redir("https://docs.testapp.example.org/oauth"), title: "testapp.example.org" } },
            { web: { uri: redir("https://blog.example.org/post"), title: "example.org" } },
          ],
        },
        urlContextMetadata: {
          urlMetadata: [
            { retrievedUrl: redir("https://docs.testapp.example.org/oauth"), urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" },
            { retrievedUrl: "https://docs.testapp.example.org/paywalled", urlRetrievalStatus: "URL_RETRIEVAL_STATUS_PAYWALL" },
          ],
        },
      },
    ],
  };
}

function fake(responses: (GeminiResponse | Error)[]) {
  const calls: { model: string; contents: string; config?: Record<string, unknown> }[] = [];
  const ai: GeminiLike = {
    models: {
      async generateContent(req) {
        calls.push(req);
        const r = responses[calls.length - 1];
        if (!r) throw new Error("no scripted response");
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
  return { ai, calls };
}

const events = () => {
  const list: AgentEvent[] = [];
  return { list, emit: (e: AgentEvent) => list.push(e) };
};

describe("resolveRedirect", () => {
  it("resolves Google grounding redirects and passes ordinary URLs through", async () => {
    expect(await resolveRedirect(redir("https://a.example.org/x"), fakeFetch)).toBe("https://a.example.org/x");
    expect(await resolveRedirect("https://plain.example.org/y", fakeFetch)).toBe("https://plain.example.org/y");
  });
  it("never follows non-Google hosts and rejects bad schemes", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response(null);
    }) as unknown as typeof fetch;
    await resolveRedirect("https://evil.example.org/redirect", spy);
    expect(called).toBe(false);
    expect(await resolveRedirect("javascript:alert(1)", spy)).toBeNull();
    expect(await resolveRedirect(REDIR + encodeURIComponent("javascript:alert(1)"), fakeFetch)).toBeNull();
  });
});

describe("geminiSchema", () => {
  it("strips keywords Gemini may reject but keeps structure", () => {
    const s = JSON.stringify(geminiSchema(GuideDraft));
    for (const k of ['"format"', '"default"', '"minLength"', '"maxLength"', '"$schema"', '"additionalProperties"']) expect(s).not.toContain(k);
    expect(s).toContain('"required"');
    expect(s).toContain('"enum"');
    expect(s).toContain("approval");
  });
});

describe("runGeminiAgent", () => {
  it("uses Google Search + URL context, builds the ledger from API metadata, then structures JSON", async () => {
    const { ai, calls } = fake([researchResponse("STATUS: FOUND\n- Review needed <https://docs.testapp.example.org/oauth>"), { text: JSON.stringify(makeDraft()) }]);
    const ev = events();
    const out = await runGeminiAgent(ai, q("TestApp"), { emit: ev.emit, model: "gemini-test", fetchImpl: fakeFetch });

    expect(calls[0].config?.tools).toEqual([{ googleSearch: {} }, { urlContext: {} }]);
    expect(calls[1].config?.responseMimeType).toBe("application/json");
    expect(calls[1].config?.responseJsonSchema).toBeTruthy();
    expect(calls[1].contents).toContain("s1 | https://docs.testapp.example.org/oauth");
    expect(calls[1].contents).toContain("search result");

    expect(out.kind).toBe("guide");
    if (out.kind !== "guide") return;
    expect(out.searches).toEqual(["TestApp OAuth app review"]);
    expect(out.fetched).toEqual(["https://docs.testapp.example.org/oauth"]);
    expect(out.searched).toContain("https://blog.example.org/post");
    expect(out.fetches).toContainEqual({ url: "https://docs.testapp.example.org/paywalled", ok: false, error: "paywall" });
    expect(ev.list.some((e) => e.type === "search")).toBe(true);

    // End to end with the integrity layer: fetched provider page backs the wait; search-only blog stays labelled.
    const r = enforceEvidence(out.draft, { mode: "generated", ledger: ledgerFrom(out.fetched, out.searched) });
    expect(r.sources.find((s) => s.id === "s1")?.retrieval).toBe("fetched");
    expect(r.sources.find((s) => s.id === "s2")?.retrieval).toBe("search-result");
    expect(r.draft.approval.wait.evidence).toBe("sourced");
  });

  it("a model that cites a URL it never retrieved gets corrected downstream", async () => {
    const draft = makeDraft();
    draft.sources[0].url = "https://made-up.example.org/oauth";
    const { ai } = fake([researchResponse("STATUS: FOUND\n- x"), { text: JSON.stringify(draft) }]);
    const out = await runGeminiAgent(ai, q("TestApp"), { emit: () => {}, fetchImpl: fakeFetch });
    if (out.kind !== "guide") throw new Error("expected guide");
    const r = enforceEvidence(out.draft, { mode: "generated", ledger: ledgerFrom(out.fetched, out.searched) });
    expect(r.sources.map((s) => s.id)).toEqual(["s2"]);
    expect(r.draft.steps[0].evidence).toBe("inference");
    expect(r.draft.approval.wait.evidence).toBe("unknown");
  });

  it("handles ambiguity", async () => {
    const amb = { reason: "Several products", candidates: [{ name: "A", website: "https://a.example.org", description: "a" }, { name: "B", website: "https://b.example.org", description: "b" }] };
    const { ai } = fake([researchResponse("STATUS: AMBIGUOUS\nA | https://a.example.org | a"), { text: JSON.stringify(amb) }]);
    expect((await runGeminiAgent(ai, q("Mercury"), { emit: () => {}, fetchImpl: fakeFetch })).kind).toBe("ambiguous");
  });

  it("handles not found without a second call", async () => {
    const { ai, calls } = fake([researchResponse("STATUS: NOT_FOUND\nNo such product.")]);
    const out = await runGeminiAgent(ai, q("Zzqxv"), { emit: () => {}, fetchImpl: fakeFetch });
    expect(out).toMatchObject({ kind: "not_found", reason: "No such product." });
    expect(calls).toHaveLength(1);
  });

  it("repairs malformed JSON, including code fences, then gives up", async () => {
    const good = fake([researchResponse("STATUS: FOUND\n- x"), { text: "not json" }, { text: "```json\n" + JSON.stringify(makeDraft()) + "\n```" }]);
    expect((await runGeminiAgent(good.ai, q("TestApp"), { emit: () => {}, fetchImpl: fakeFetch })).kind).toBe("guide");
    expect(good.calls[2].contents).toContain("failed validation");

    const bad = fake([researchResponse("STATUS: FOUND\n- x"), { text: "{}" }, { text: "{}" }, { text: "{}" }]);
    expect(await runGeminiAgent(bad.ai, q("TestApp"), { emit: () => {}, fetchImpl: fakeFetch })).toMatchObject({ kind: "error", code: "malformed_output" });
  });

  it("maps provider errors", async () => {
    const cases: [Error, string][] = [
      [Object.assign(new Error("API key not valid. Please pass a valid API key."), { status: 400 }), "auth"],
      [Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 }), "rate_limited"],
      [Object.assign(new Error("internal"), { status: 503 }), "provider_unavailable"],
      [Object.assign(new Error("aborted"), { name: "AbortError" }), "timeout"],
    ];
    for (const [err, code] of cases) {
      const { ai } = fake([err]);
      expect(await runGeminiAgent(ai, q("TestApp"), { emit: () => {}, fetchImpl: fakeFetch })).toMatchObject({ kind: "error", code });
    }
  });

  it("handles blocked prompts and empty notes", async () => {
    expect(await runGeminiAgent(fake([{ promptFeedback: { blockReason: "SAFETY" } }]).ai, q("TestApp"), { emit: () => {}, fetchImpl: fakeFetch })).toMatchObject({
      kind: "error",
      code: "refused",
    });
    expect(await runGeminiAgent(fake([{ text: "" }]).ai, q("TestApp"), { emit: () => {}, fetchImpl: fakeFetch })).toMatchObject({
      kind: "error",
      code: "no_result",
    });
  });
});
