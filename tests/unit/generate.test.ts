import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createFixtureClient } from "@/lib/agent/fixture";
import { anthropicResearcher } from "@/lib/agent/researcher";
import { parseQuery } from "@/lib/input";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "compass-test-"));
  vi.stubEnv("COMPASS_DATA_DIR", dir);
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("VERCEL", "");
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const q = (s: string) => {
  const r = parseQuery(s);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("generateGuide", () => {
  it("researches, enforces evidence, persists, and serves from cache", async () => {
    const { generateGuide } = await import("@/lib/generate");
    const { getStore } = await import("@/lib/store");
    const first = await generateGuide(q("Acme Notes"), { emit: () => {}, researcher: anthropicResearcher(createFixtureClient()) });
    expect(first.kind).toBe("guide");
    if (first.kind !== "guide") return;
    expect(first.cached).toBe(false);

    const g = await getStore().get(first.slug);
    expect(g).not.toBeNull();
    if (!g) return;
    expect(g.origin).toBe("fixture");
    // Unretrieved source dropped; claim relying on it downgraded.
    expect(g.sources.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(g.nuances[0].evidence).toBe("inference");
    // Source seen only in search results is labelled as such.
    expect(g.sources.find((s) => s.id === "s2")?.retrieval).toBe("search-result");
    // Invented wait removed.
    expect(g.approval.wait.evidence).toBe("unknown");
    // Unsourced managed-auth claim neutralised.
    expect(g.composioManaged.status).toBe("unknown");
    expect(g.research?.integrityCorrections.length).toBeGreaterThanOrEqual(3);

    const second = await generateGuide(q("acme   notes"), { emit: () => {}, researcher: anthropicResearcher(createFixtureClient()) });
    expect(second).toMatchObject({ kind: "guide", slug: first.slug, cached: true });

    const forced = await generateGuide(q("Acme Notes"), { emit: () => {}, force: true, researcher: anthropicResearcher(createFixtureClient()) });
    expect(forced.kind === "guide" && forced.slug !== first.slug).toBe(true);
  });

  it("returns not_configured without a model client", async () => {
    const { generateGuide } = await import("@/lib/generate");
    expect(await generateGuide(q("Brand New App"), { emit: () => {}, researcher: null })).toMatchObject({
      kind: "error",
      code: "not_configured",
    });
  });

  it("propagates ambiguity without saving anything", async () => {
    const { generateGuide } = await import("@/lib/generate");
    const { getStore } = await import("@/lib/store");
    const before = (await getStore().recent(50)).length;
    const r = await generateGuide(q("Mercury"), { emit: () => {}, researcher: anthropicResearcher(createFixtureClient()) });
    expect(r.kind).toBe("ambiguous");
    expect((await getStore().recent(50)).length).toBe(before);
  });
});

describe("liveMode", () => {
  it("never reports the key, only the mode", async () => {
    const { liveMode } = await import("@/lib/generate");
    vi.stubEnv("COMPASS_AGENT_MODE", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(liveMode()).toBe("unconfigured");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-canary");
    expect(liveMode()).toBe("anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "gm-test");
    expect(liveMode()).toBe("gemini");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-canary");
    expect(liveMode()).toBe("anthropic");
    vi.stubEnv("COMPASS_PROVIDER", "gemini");
    expect(liveMode()).toBe("gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(liveMode()).toBe("unconfigured");
    vi.stubEnv("COMPASS_PROVIDER", "");
    vi.stubEnv("COMPASS_AGENT_MODE", "fixture");
    expect(liveMode()).toBe("fixture");
  });
});
