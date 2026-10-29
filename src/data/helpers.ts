import type { Claim, EvidenceKind, Source, Step } from "@/lib/schema";

export const REVIEWED = "2026-10-29";

export function c(text: string, evidence: EvidenceKind, sourceIds: string[] = [], note?: string): Claim {
  return note ? { text, evidence, sourceIds, note } : { text, evidence, sourceIds };
}

export function step(title: string, actor: Step["actor"], claim: Claim): Step {
  return { title, actor, ...claim };
}

export function src(id: string, url: string, title: string, publisher: Source["publisher"]): Source {
  return { id, url, title, publisher, retrieval: "curator-checked", checkedAt: REVIEWED };
}

export const COMPOSIO_CUSTOM = src(
  "cmp",
  "https://docs.composio.dev/docs/custom-app-vs-managed-app",
  "Composio — When to use your own developer credentials",
  "composio",
);

export const COMPOSIO_UNKNOWN = c(
  "Composio's public docs don't list which toolkits have managed OAuth; check the toolkit's composio_managed_auth_schemes field (empty means bring your own app).",
  "sourced",
  ["cmp"],
);
