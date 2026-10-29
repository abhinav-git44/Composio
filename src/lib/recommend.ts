import type { Guide } from "./schema";

export interface Needs {
  /** Users must see your app name (not Composio's) on the consent screen. */
  ownBranding: boolean;
  /** You need scopes beyond Composio's defaults. */
  customScopes: boolean;
  /** Real customers / production traffic, not a prototype. */
  production: boolean;
  /** You need dedicated rate-limit quota. */
  dedicatedQuota: boolean;
}

export type Choice = "managed" | "managed-now-custom-in-parallel" | "custom" | "check-availability";

export interface Recommendation {
  choice: Choice;
  headline: string;
  reasons: string[];
}

/**
 * Deterministic managed-vs-custom recommendation. Rules come from Composio's
 * "When to use your own developer credentials" doc (branding, custom scopes, quota) plus the
 * guide's own approval data. No model involved.
 */
export function recommend(
  guide: Pick<Guide, "appName" | "composioManaged" | "approval" | "difficulty">,
  needs: Needs,
): Recommendation {
  const reasons: string[] = [];
  const wantsCustom = needs.ownBranding || needs.customScopes || needs.dedicatedQuota;
  if (needs.ownBranding) reasons.push("You want your own name on the consent screen; managed apps show Composio's.");
  if (needs.customScopes) reasons.push("You need scopes beyond the managed defaults.");
  if (needs.dedicatedQuota) reasons.push("Managed apps share rate-limit quota across Composio users.");

  const status = guide.composioManaged.status;
  const reviewLikely = guide.approval.required === "always" || guide.approval.required === "conditional";

  if (status === "not-available") {
    return {
      choice: "custom",
      headline: `Register your own ${guide.appName} OAuth app — no managed option is listed.`,
      reasons: [`No Composio-managed OAuth app was found for ${guide.appName}.`, ...reasons],
    };
  }

  if (status === "unknown") {
    return {
      choice: "check-availability",
      headline: wantsCustom || needs.production
        ? `Plan for your own ${guide.appName} OAuth app, and check whether a managed app exists for prototyping.`
        : `Check whether Composio offers managed auth for ${guide.appName}; if not, register your own app.`,
      reasons: [
        "Managed-auth availability for this app is unverified. Check the toolkit's composio_managed_auth_schemes field (empty = bring your own).",
        ...reasons,
      ],
    };
  }

  // Managed is available.
  if (!wantsCustom && !needs.production) {
    return {
      choice: "managed",
      headline: "Start with Composio's managed OAuth app.",
      reasons: ["You can connect users today without registering anything.", "You can switch to your own app later by adding an auth config."],
    };
  }
  if (reviewLikely) {
    return {
      choice: "managed-now-custom-in-parallel",
      headline: `Build on managed auth now, and start your own ${guide.appName} app's review in parallel.`,
      reasons: [
        ...reasons,
        ...(needs.production && !wantsCustom ? ["Production apps usually want their own branding and quota."] : []),
        `${guide.appName} may require review before your own app can serve all users, so start early.`,
      ],
    };
  }
  return {
    choice: "custom",
    headline: `Register your own ${guide.appName} OAuth app.`,
    reasons: reasons.length ? reasons : ["Production apps usually want their own branding and quota."],
  };
}
