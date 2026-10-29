import "server-only";
import { activeProvider, getResearcher, type Researcher } from "./agent/researcher";
import type { AgentErrorCode, AgentEvent } from "./agent/types";
import { enforceEvidence, ledgerFrom } from "./evidence";
import { queryKey, type ParsedQuery } from "./input";
import { Guide, type AmbiguousReport } from "./schema";
import { generatedSlug } from "./slug";
import { getStore } from "./store";

export type LiveMode = "anthropic" | "gemini" | "fixture" | "unconfigured";

/** Which research backend is active. Never exposes the key itself. */
export function liveMode(): LiveMode {
  return activeProvider() ?? "unconfigured";
}

export type GenerateResult =
  | { kind: "guide"; slug: string; cached: boolean }
  | { kind: "ambiguous"; report: AmbiguousReport }
  | { kind: "not_found"; reason: string }
  | { kind: "error"; code: AgentErrorCode | "store_failed"; message: string; detail?: string };

export async function generateGuide(
  query: Extract<ParsedQuery, { ok: true }>,
  opts: { emit: (e: AgentEvent) => void; signal?: AbortSignal; force?: boolean; researcher?: Researcher | null },
): Promise<GenerateResult> {
  const store = getStore();
  const key = queryKey(query);
  if (!opts.force) {
    const existing = await store.findByQuery(key).catch(() => null);
    if (existing) return { kind: "guide", slug: existing, cached: true };
  }

  const researcher = opts.researcher === undefined ? getResearcher() : opts.researcher;
  if (!researcher) {
    return {
      kind: "error",
      code: "not_configured",
      message: "Live generation is not configured on this server (set GEMINI_API_KEY or ANTHROPIC_API_KEY).",
    };
  }

  const started = Date.now();
  const outcome = await researcher.run(query, { emit: opts.emit, signal: opts.signal });
  if (outcome.kind !== "guide") return outcome;

  opts.emit({ type: "status", message: "Checking every citation against what was actually retrieved…" });
  const ledger = ledgerFrom(outcome.fetched, outcome.searched);
  const { draft, sources, corrections } = enforceEvidence(outcome.draft, { mode: "generated", ledger });

  const isFixture = researcher.provider === "fixture";
  const guide = Guide.parse({
    ...draft,
    schemaVersion: 1,
    slug: generatedSlug(draft.appName),
    origin: isFixture ? "fixture" : "generated",
    createdAt: new Date().toISOString(),
    query: query.value,
    sources,
    research: {
      model: outcome.model ?? researcher.model,
      searches: outcome.searches,
      fetches: outcome.fetches,
      searchResultUrls: new Set(outcome.searched).size,
      durationMs: Date.now() - started,
      integrityCorrections: corrections,
    },
  });

  try {
    await store.put(guide, key);
  } catch {
    return { kind: "error", code: "store_failed", message: "The guide was generated but could not be saved." };
  }
  return { kind: "guide", slug: guide.slug, cached: false };
}
