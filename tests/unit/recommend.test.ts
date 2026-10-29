import { describe, expect, it } from "vitest";
import { recommend, type Needs } from "@/lib/recommend";
import { CURATED } from "@/data";
import type { Guide } from "@/lib/schema";

const none: Needs = { production: false, ownBranding: false, customScopes: false, dedicatedQuota: false };

function guide(status: Guide["composioManaged"]["status"], required: Guide["approval"]["required"]) {
  const g = structuredClone(CURATED.find((x) => x.slug === "slack")!);
  g.composioManaged.status = status;
  g.approval.required = required;
  return g;
}

describe("recommend", () => {
  it("prototype + managed available → managed", () => {
    expect(recommend(guide("available", "always"), none).choice).toBe("managed");
  });
  it("branding need + review required → managed now, custom in parallel", () => {
    const r = recommend(guide("available", "always"), { ...none, ownBranding: true });
    expect(r.choice).toBe("managed-now-custom-in-parallel");
    expect(r.reasons.join(" ")).toMatch(/consent screen/);
  });
  it("production + no review → custom", () => {
    expect(recommend(guide("available", "none"), { ...none, production: true }).choice).toBe("custom");
  });
  it("managed not available → custom regardless of needs", () => {
    expect(recommend(guide("not-available", "none"), none).choice).toBe("custom");
  });
  it("unknown availability → check, and never claims managed exists", () => {
    const r = recommend(guide("unknown", "always"), none);
    expect(r.choice).toBe("check-availability");
    expect(r.reasons[0]).toMatch(/composio_managed_auth_schemes/);
  });
  it("unknown + custom needs → plan for own app", () => {
    expect(recommend(guide("unknown", "always"), { ...none, customScopes: true }).headline).toMatch(/Plan for your own/);
  });
  it("every curated guide yields a recommendation for every combination of needs", () => {
    const keys = Object.keys(none) as (keyof Needs)[];
    for (const g of CURATED) {
      for (let mask = 0; mask < 1 << keys.length; mask++) {
        const n = Object.fromEntries(keys.map((k, i) => [k, !!(mask & (1 << i))])) as unknown as Needs;
        const r = recommend(g, n);
        expect(r.headline.length).toBeGreaterThan(10);
      }
    }
  });
});
