import { describe, expect, it } from "vitest";
import { CURATED } from "@/data";
import { enforceEvidence } from "@/lib/evidence";
import { allClaims, Guide } from "@/lib/schema";

describe("curated guides", () => {
  it("includes the demo apps with different difficulty levels", () => {
    const levels = new Map(CURATED.map((g) => [g.slug, g.difficulty.level]));
    expect(levels.get("github")).toBe("easy");
    expect(levels.get("slack")).toBe("moderate");
    expect(levels.get("google-gmail")).toBe("hard");
    expect(new Set(levels.values()).size).toBeGreaterThanOrEqual(3);
  });

  for (const g of CURATED) {
    describe(g.slug, () => {
      it("matches the schema", () => {
        expect(() => Guide.parse(g)).not.toThrow();
      });

      it("cites only sources that exist, and every sourced claim has one", () => {
        const ids = new Set(g.sources.map((s) => s.id));
        for (const c of allClaims(g)) {
          for (const id of c.sourceIds) expect(ids.has(id), `${g.slug}: unknown source ${id} in "${c.text}"`).toBe(true);
          if (c.evidence === "sourced") expect(c.sourceIds.length, `${g.slug}: sourced without source: "${c.text}"`).toBeGreaterThan(0);
        }
      });

      it("passes the same integrity rules as generated guides, with zero corrections", () => {
        const r = enforceEvidence(g, { mode: "curated", curatedSources: g.sources });
        expect(r.corrections).toEqual([]);
      });

      it("claims nothing as tested (no hands-on provider setup was performed)", () => {
        expect(allClaims(g).filter((c) => c.evidence === "tested")).toEqual([]);
      });

      it("never presents an approval wait as an estimate", () => {
        expect(["sourced", "unknown"]).toContain(g.approval.wait.evidence);
      });

      it("uses https sources, each cited at least once", () => {
        const cited = new Set(allClaims(g).flatMap((c) => c.sourceIds));
        for (const s of g.sources) {
          expect(s.url.startsWith("https://")).toBe(true);
          expect(cited.has(s.id), `${g.slug}: source ${s.id} never cited`).toBe(true);
        }
      });
    });
  }
});
