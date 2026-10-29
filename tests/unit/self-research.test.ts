import { describe, expect, it } from "vitest";
import type { GeminiLike, GeminiResponse } from "@/lib/agent/gemini";
import { rankUrls, runSelfResearch, type SelfResearchDeps } from "@/lib/agent/self-research";
import { enforceEvidence, ledgerFrom } from "@/lib/evidence";
import { parseQuery } from "@/lib/input";
import { makeDraft } from "./fixtures";

const q = (s: string) => {
  const r = parseQuery(s);
  if (!r.ok) throw new Error(r.error);
  return r;
};

const plan = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    status: "found",
    reason: "",
    appName: "TestApp",
    officialDomains: ["testapp.example.org"],
    searchQueries: ["TestApp OAuth app registration"],
    candidateUrls: ["https://docs.testapp.example.org/oauth", "https://docs.testapp.example.org/guessed-404"],
    candidates: [],
    ...over,
  });

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

const deps: SelfResearchDeps = {
  search: async () => ({ hits: [{ url: "https://blog.example.org/post", title: "Blog" }, { url: "https://docs.testapp.example.org/oauth", title: "OAuth" }], engine: "test" }),
  fetchPage: async (url) => {
    if (url.includes("404")) throw new Error("HTTP 404");
    if (url.includes("blog")) throw new Error("HTTP 403");
    return { url, title: "TestApp OAuth", text: "Review takes up to 5 business days. ".repeat(20) };
  },
};

describe("rankUrls", () => {
  it("puts official domains first, then Composio docs, dedupes", () => {
    expect(
      rankUrls(["https://blog.example.org/a", "https://docs.composio.dev/x", "https://developers.testapp.example.org/oauth", "https://developers.testapp.example.org/oauth/"], ["testapp.example.org"]),
    ).toEqual(["https://developers.testapp.example.org/oauth", "https://docs.composio.dev/x", "https://blog.example.org/a"]);
  });
});

describe("runSelfResearch", () => {
  it("plans, searches, downloads, then writes from downloaded pages only", async () => {
    const { ai, calls } = fake([{ text: plan() }, { text: JSON.stringify(makeDraft()) }]);
    const out = await runSelfResearch(ai, q("TestApp"), { emit: () => {}, deps });
    expect(out.kind).toBe("guide");
    if (out.kind !== "guide") return;
    // No provider tools are requested: the server does retrieval.
    expect(calls.every((c) => !c.config?.tools)).toBe(true);
    expect(calls[1].contents).toContain("### s1 | https://docs.testapp.example.org/oauth");
    expect(calls[1].contents).not.toContain("guessed-404 |");
    expect(out.searches).toContain("site:docs.composio.dev TestApp");
    expect(out.fetches).toContainEqual({ url: "https://docs.testapp.example.org/guessed-404", ok: false, error: "HTTP 404" });
    expect(out.model).toContain("server-side search + fetch");

    const r = enforceEvidence(out.draft, { mode: "generated", ledger: ledgerFrom(out.fetched, out.searched) });
    expect(r.sources.find((s) => s.id === "s1")?.retrieval).toBe("fetched");
    expect(r.sources.find((s) => s.id === "s2")?.retrieval).toBe("search-result");
    expect(r.draft.approval.wait.evidence).toBe("sourced");
  });

  it("returns ambiguity from the plan without searching", async () => {
    let searched = false;
    const { ai } = fake([
      {
        text: plan({
          status: "ambiguous",
          reason: "Two products",
          candidates: [
            { name: "A", website: "https://a.example.org", description: "a" },
            { name: "B", website: "https://b.example.org", description: "b" },
          ],
        }),
      },
    ]);
    const out = await runSelfResearch(ai, q("Mercury"), { emit: () => {}, deps: { ...deps, search: async () => ((searched = true), { hits: [], engine: "x" }) } });
    expect(out.kind).toBe("ambiguous");
    expect(searched).toBe(false);
  });

  it("refuses to write a guide when no page could be downloaded", async () => {
    const { ai, calls } = fake([{ text: plan() }]);
    const out = await runSelfResearch(ai, q("TestApp"), { emit: () => {}, deps: { ...deps, fetchPage: async () => { throw new Error("HTTP 403"); } } });
    expect(out).toMatchObject({ kind: "error", code: "no_result" });
    expect(calls).toHaveLength(1);
  });

  it("switches model on quota errors and reports provider detail when all fail", async () => {
    const quota = () => Object.assign(new Error('{"error":{"message":"limit: 0 for model"}}'), { status: 429 });
    const ok = fake([quota(), { text: plan() }, { text: JSON.stringify(makeDraft()) }]);
    const out = await runSelfResearch(ok.ai, q("TestApp"), { emit: () => {}, deps, models: ["m1", "m2"] });
    expect(out.kind).toBe("guide");
    expect(ok.calls.map((c) => c.model)).toEqual(["m1", "m2", "m2"]);

    const bad = fake([quota(), quota()]);
    const out2 = await runSelfResearch(bad.ai, q("TestApp"), { emit: () => {}, deps, models: ["m1", "m2"] });
    expect(out2).toMatchObject({ kind: "error", code: "rate_limited" });
    if (out2.kind === "error") expect(out2.detail).toBe("m1: limit: 0 for model | m2: limit: 0 for model");
  });

  it("includes the user's own website first when they submit a URL", async () => {
    const fetched: string[] = [];
    const { ai } = fake([{ text: plan({ officialDomains: [] }) }, { text: JSON.stringify(makeDraft()) }]);
    await runSelfResearch(ai, q("https://docs.testapp.example.org/start"), {
      emit: () => {},
      deps: { ...deps, fetchPage: async (u) => (fetched.push(u), { url: u, title: "t", text: "x".repeat(300) }) },
    });
    expect(fetched).toContain("https://docs.testapp.example.org/start");
  });

  it("repairs invalid guide JSON", async () => {
    const { ai } = fake([{ text: plan() }, { text: "{}" }, { text: JSON.stringify(makeDraft()) }]);
    expect((await runSelfResearch(ai, q("TestApp"), { emit: () => {}, deps })).kind).toBe("guide");
  });
});
