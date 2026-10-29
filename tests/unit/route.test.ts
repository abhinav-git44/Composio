import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "compass-route-"));
  vi.stubEnv("COMPASS_DATA_DIR", dir);
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => resetRateLimits());

const post = (body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/generate", { method: "POST", body, headers: { "x-forwarded-for": "10.0.0.1", ...headers } });

async function readEvents(res: Response) {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((c) => c.startsWith("data: "))
    .map((c) => JSON.parse(c.slice(6)));
}

describe("POST /api/generate", () => {
  it("rejects non-JSON content types", async () => {
    const { POST } = await import("@/app/api/generate/route");
    const res = await POST(post("query=slack", { "content-type": "application/x-www-form-urlencoded" }));
    expect(res.status).toBe(415);
  });

  it("rejects malformed JSON", async () => {
    const { POST } = await import("@/app/api/generate/route");
    const res = await POST(post("{nope"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });

  it("rejects oversized bodies", async () => {
    const { POST } = await import("@/app/api/generate/route");
    expect((await POST(post(JSON.stringify({ query: "x".repeat(3000) })))).status).toBe(413);
  });

  it("rejects invalid queries before doing any work", async () => {
    const { POST } = await import("@/app/api/generate/route");
    for (const query of ["", "http://localhost:3000", "javascript:alert(1)", 5]) {
      const res = await POST(post(JSON.stringify({ query })));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_query");
    }
  });

  it("returns 503 with a clear message when no API key is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("COMPASS_AGENT_MODE", "");
    const { POST } = await import("@/app/api/generate/route");
    const res = await POST(post(JSON.stringify({ query: "Linear" })));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "not_configured" });
  });

  it("streams progress and a final slug in fixture mode", async () => {
    vi.stubEnv("COMPASS_AGENT_MODE", "fixture");
    const { POST } = await import("@/app/api/generate/route");
    const res = await POST(post(JSON.stringify({ query: "Acme Notes" })));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const evs = await readEvents(res);
    expect(evs.some((e) => e.type === "search")).toBe(true);
    const done = evs.at(-1);
    expect(done.type).toBe("done");
    expect(done.slug).toMatch(/^acme-notes-fixture-[a-f0-9]{6}$/);
  });

  it("streams an ambiguity event", async () => {
    vi.stubEnv("COMPASS_AGENT_MODE", "fixture");
    const { POST } = await import("@/app/api/generate/route");
    const evs = await readEvents(await POST(post(JSON.stringify({ query: "Mercury" }))));
    expect(evs.at(-1).type).toBe("ambiguous");
  });

  it("rate-limits repeated requests from one client", async () => {
    vi.stubEnv("COMPASS_AGENT_MODE", "fixture");
    const { POST } = await import("@/app/api/generate/route");
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await POST(post(JSON.stringify({ query: "Acme Notes" })));
      statuses.push(res.status);
      if (res.status === 200) await res.text();
    }
    expect(statuses.slice(0, 6).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("never echoes the API key in any response", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-CANARY-should-never-leak");
    vi.stubEnv("COMPASS_AGENT_MODE", "fixture");
    const { POST } = await import("@/app/api/generate/route");
    const text = await (await POST(post(JSON.stringify({ query: "Acme Notes" })))).text();
    expect(text).not.toContain("CANARY");
  });
});

describe("GET /api/guides/[slug]", () => {
  it("returns curated guides, 404s unknown slugs, 400s bad slugs", async () => {
    const { GET } = await import("@/app/api/guides/[slug]/route");
    const call = (slug: string) => GET(new Request(`http://localhost/api/guides/${slug}`), { params: Promise.resolve({ slug }) });
    const ok = await call("github");
    expect(ok.status).toBe(200);
    expect((await ok.json()).appName).toBe("GitHub");
    expect((await call("no-such-guide")).status).toBe(404);
    expect((await call("../../etc/passwd")).status).toBe(400);
  });
});
