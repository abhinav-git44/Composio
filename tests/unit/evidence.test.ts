import { describe, expect, it } from "vitest";
import { enforceEvidence, ledgerFrom, normalizeUrl } from "@/lib/evidence";
import { makeDraft } from "./fixtures";

const fetchedS1 = ledgerFrom(["https://docs.testapp.example.org/oauth"], []);

describe("normalizeUrl", () => {
  it("ignores case, www, trailing slash, fragments, tracking params and .md variants", () => {
    const a = normalizeUrl("https://WWW.Docs.Example.org/Path/?utm_source=x#frag");
    expect(a).toBe(normalizeUrl("https://docs.example.org/Path"));
    expect(normalizeUrl("http://docs.example.org/a")).toBe(normalizeUrl("https://docs.example.org/a"));
    expect(normalizeUrl("https://docs.example.org/a.md")).toBe(normalizeUrl("https://docs.example.org/a"));
    expect(normalizeUrl("https://support.google.com/cloud/answer/1?hl=es")).toBe(normalizeUrl("https://support.google.com/cloud/answer/1"));
  });
  it("keeps meaningful query params", () => {
    expect(normalizeUrl("https://x.example.org/a?id=1")).not.toBe(normalizeUrl("https://x.example.org/a?id=2"));
  });
  it("rejects non-http schemes", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("enforceEvidence (generated)", () => {
  it("keeps fetched sources and labels retrieval", () => {
    const r = enforceEvidence(makeDraft(), { mode: "generated", ledger: ledgerFrom(["https://docs.testapp.example.org/oauth"], ["https://blog.example.org/post"]) });
    expect(r.sources.map((s) => [s.id, s.retrieval])).toEqual([
      ["s1", "fetched"],
      ["s2", "search-result"],
    ]);
    expect(r.corrections).toEqual([]);
  });

  it("drops sources that were never retrieved and downgrades claims that relied on them", () => {
    const r = enforceEvidence(makeDraft(), { mode: "generated", ledger: ledgerFrom([], []) });
    expect(r.sources).toEqual([]);
    expect(r.draft.steps[0].evidence).toBe("inference");
    expect(r.draft.steps[0].note).toMatch(/no retrieved source/i);
    expect(r.draft.difficulty.rationale.evidence).toBe("inference");
    expect(r.corrections.some((c) => c.includes("Dropped source [s1]"))).toBe(true);
  });

  it("never allows generated guides to claim tested", () => {
    const d = makeDraft();
    d.steps[0] = { ...d.steps[0], evidence: "tested", sourceIds: [] };
    const r = enforceEvidence(d, { mode: "generated", ledger: fetchedS1 });
    expect(r.draft.steps[0].evidence).toBe("inference");
    expect(r.corrections.join(" ")).toMatch(/tested/);
  });

  it("strips invented approval waits", () => {
    const d = makeDraft();
    d.approval.wait = { text: "Usually 2 weeks", evidence: "estimate", sourceIds: [] };
    const r = enforceEvidence(d, { mode: "generated", ledger: fetchedS1 });
    expect(r.draft.approval.wait.evidence).toBe("unknown");
    expect(r.draft.approval.wait.text).toMatch(/no provider-published review time/i);
    expect(r.draft.approval.wait.note).toContain("Usually 2 weeks");
  });

  it("strips inferred waits when review is required", () => {
    const d = makeDraft();
    d.approval.wait = { text: "Probably a few days", evidence: "inference", sourceIds: [] };
    expect(enforceEvidence(d, { mode: "generated", ledger: fetchedS1 }).draft.approval.wait.evidence).toBe("unknown");
  });

  it("allows an inferred 'no wait' only when no review is required", () => {
    const d = makeDraft();
    d.approval.required = "none";
    d.approval.wait = { text: "No review, so no wait.", evidence: "inference", sourceIds: [] };
    expect(enforceEvidence(d, { mode: "generated", ledger: fetchedS1 }).draft.approval.wait.evidence).toBe("inference");
  });

  it("requires approval waits to be backed by a fetched page, not just a search snippet", () => {
    const d = makeDraft();
    d.approval.wait = { text: "Up to 10 weeks", evidence: "sourced", sourceIds: ["s2"] };
    const r = enforceEvidence(d, { mode: "generated", ledger: ledgerFrom(["https://docs.testapp.example.org/oauth"], ["https://blog.example.org/post"]) });
    expect(r.draft.approval.wait.evidence).toBe("unknown");
  });

  it("keeps sourced approval waits backed by a fetched page", () => {
    const r = enforceEvidence(makeDraft(), { mode: "generated", ledger: fetchedS1 });
    expect(r.draft.approval.wait.evidence).toBe("sourced");
    expect(r.draft.approval.wait.text).toBe("Review takes up to 5 business days.");
  });

  it("refuses unsourced managed-auth claims", () => {
    const d = makeDraft();
    d.composioManaged = { text: "Composio manages it", evidence: "inference", sourceIds: [], status: "available" };
    const r = enforceEvidence(d, { mode: "generated", ledger: fetchedS1 }).draft.composioManaged;
    expect(r.status).toBe("unknown");
    expect(r.evidence).toBe("unknown");
    // The displayed text must not still assert the removed claim.
    expect(r.text).not.toContain("Composio manages it");
    expect(r.note).toContain("Composio manages it");
  });

  it("removes duplicate source ids and dangling references", () => {
    const d = makeDraft();
    d.sources.push({ ...d.sources[0] });
    d.steps[0].sourceIds = ["s1", "s1", "s404"];
    const r = enforceEvidence(d, { mode: "generated", ledger: fetchedS1 });
    expect(r.draft.steps[0].sourceIds).toEqual(["s1"]);
    expect(r.corrections.join(" ")).toMatch(/duplicate/);
  });

  it("does not mutate its input", () => {
    const d = makeDraft();
    const before = JSON.stringify(d);
    enforceEvidence(d, { mode: "generated", ledger: ledgerFrom([], []) });
    expect(JSON.stringify(d)).toBe(before);
  });
});
