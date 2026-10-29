import { z } from "zod";

/**
 * Evidence kinds. Every claim in a guide carries exactly one.
 * - tested:    someone performed this step against the real provider and observed the result.
 * - sourced:   stated by a retrieved source (linked via sourceIds).
 * - estimate:  a time/effort estimate made by the guide author; not provider-published.
 * - inference: a reasoned conclusion not directly stated by any source.
 * - unknown:   could not be determined.
 */
export const EVIDENCE_KINDS = ["tested", "sourced", "estimate", "inference", "unknown"] as const;
export const EvidenceKind = z.enum(EVIDENCE_KINDS);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

const text = (max: number) => z.string().trim().min(1).max(max);

export const Claim = z.object({
  text: text(800),
  evidence: EvidenceKind,
  sourceIds: z.array(z.string().max(20)).max(6).default([]),
  note: z.string().max(400).optional(),
});
export type Claim = z.infer<typeof Claim>;

export const ACTORS = ["agent", "you", "either"] as const;

export const Step = Claim.extend({
  title: text(140),
  actor: z.enum(ACTORS),
});
export type Step = z.infer<typeof Step>;

export const DIFFICULTY_LEVELS = ["easy", "moderate", "hard", "gated", "unknown"] as const;

export const DraftSource = z.object({
  id: z.string().min(1).max(20),
  url: z.string().url().max(500),
  title: text(200),
  publisher: z.enum(["provider", "composio", "third-party"]),
});
export type DraftSource = z.infer<typeof DraftSource>;

/** What the research agent (or a curator) authors. */
export const GuideDraft = z.object({
  appName: text(80),
  vendor: text(120),
  website: z.string().url().max(300),
  oauthSupport: z.enum(["yes", "no", "unclear"]),
  summary: text(700),
  difficulty: z.object({
    level: z.enum(DIFFICULTY_LEVELS),
    rationale: Claim,
  }),
  handsOnEffort: Claim,
  approval: z.object({
    required: z.enum(["none", "conditional", "always", "unknown"]),
    triggers: z.array(Claim).max(8),
    process: z.array(Claim).max(10),
    wait: Claim,
  }),
  composioManaged: Claim.extend({
    status: z.enum(["available", "not-available", "unknown"]),
  }),
  prerequisites: z.array(Claim).max(12),
  steps: z.array(Step).min(1).max(16),
  nuances: z.array(Claim).max(12),
  blockers: z
    .array(z.object({ problem: text(300), resolution: Claim }))
    .max(8),
  agentCanDo: z.array(text(300)).max(10),
  youMustDo: z.array(text(300)).max(10),
  openQuestions: z.array(text(400)).max(10),
  sources: z.array(DraftSource).max(20),
});
export type GuideDraft = z.infer<typeof GuideDraft>;

export const Retrieval = z.enum(["fetched", "search-result", "curator-checked"]);

export const Source = DraftSource.extend({
  retrieval: Retrieval,
  checkedAt: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

export const ResearchTrace = z.object({
  model: z.string(),
  searches: z.array(z.string()),
  fetches: z.array(z.object({ url: z.string(), ok: z.boolean(), error: z.string().optional() })),
  searchResultUrls: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  integrityCorrections: z.array(z.string()),
});
export type ResearchTrace = z.infer<typeof ResearchTrace>;

export const Guide = GuideDraft.extend({
  schemaVersion: z.literal(1),
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
  origin: z.enum(["curated", "generated", "fixture"]),
  createdAt: z.string(),
  reviewedAt: z.string().optional(),
  query: z.string().optional(),
  sources: z.array(Source).max(20),
  research: ResearchTrace.optional(),
});
export type Guide = z.infer<typeof Guide>;

export const AmbiguousReport = z.object({
  reason: text(400),
  candidates: z
    .array(z.object({ name: text(80), website: z.string().url().max(300), description: text(200) }))
    .min(2)
    .max(5),
});
export type AmbiguousReport = z.infer<typeof AmbiguousReport>;

export const NotFoundReport = z.object({ reason: text(400) });

/** All claims in a guide, for audits and tests. */
export function allClaims(g: GuideDraft): Claim[] {
  return [
    g.difficulty.rationale,
    g.handsOnEffort,
    ...g.approval.triggers,
    ...g.approval.process,
    g.approval.wait,
    g.composioManaged,
    ...g.prerequisites,
    ...g.steps,
    ...g.nuances,
    ...g.blockers.map((b) => b.resolution),
  ];
}
