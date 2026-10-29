import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CURATED } from "@/data";
import { guideToMarkdown } from "@/lib/markdown";
import { createFileStore } from "@/lib/store";

describe("guideToMarkdown", () => {
  it("includes verdict, labelled claims, numbered citations and sources", () => {
    const md = guideToMarkdown(CURATED.find((g) => g.slug === "slack")!, "https://x.example/guides/slack");
    expect(md).toContain("# Slack: OAuth app setup guide");
    expect(md).toContain("**Approval wait:**");
    expect(md).toMatch(/_\(Sourced\)_ \[\d\]/);
    expect(md).toContain("## Sources");
    expect(md).toContain("https://docs.slack.dev/distribution");
    expect(md).toContain("https://x.example/guides/slack");
  });
});

describe("FileStore", () => {
  it("round-trips, ignores corrupt files and rejects path traversal", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "compass-store-"));
    try {
      const store = createFileStore(dir);
      const g = { ...structuredClone(CURATED[0]), slug: "roundtrip-abc123", origin: "generated" as const };
      await store.put(g, "name:roundtrip");
      expect((await store.get("roundtrip-abc123"))?.appName).toBe(g.appName);
      expect(await store.findByQuery("name:roundtrip")).toBe("roundtrip-abc123");
      writeFileSync(path.join(dir, "corrupt-000000.json"), "{not json");
      expect(await store.get("corrupt-000000")).toBeNull();
      expect(await store.get("../../etc/passwd")).toBeNull();
      expect((await store.recent(10)).map((x) => x.slug)).toEqual(["roundtrip-abc123"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
