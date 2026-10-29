import type { Claim, DraftSource, GuideDraft, Source } from "./schema";

/** Normalise a URL for comparing "what the guide cites" against "what was actually retrieved". */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const k of [...u.searchParams.keys()]) {
      if (k.startsWith("utm_") || k === "ref" || k === "authuser" || k === "hl") u.searchParams.delete(k);
    }
    u.searchParams.sort();
    let s = `${u.protocol === "http:" ? "https:" : u.protocol}//${u.hostname}${u.pathname}`;
    s = s.replace(/\.md$/, "").replace(/\/+$/, "");
    const q = u.searchParams.toString();
    return q ? `${s}?${q}` : s;
  } catch {
    return null;
  }
}

export interface RetrievalLedger {
  /** URLs whose full content the agent fetched successfully. */
  fetched: Set<string>;
  /** URLs that appeared in web search results. */
  searched: Set<string>;
}

export function ledgerFrom(fetched: string[], searched: string[]): RetrievalLedger {
  const norm = (xs: string[]) => new Set(xs.map(normalizeUrl).filter((x): x is string => !!x));
  return { fetched: norm(fetched), searched: norm(searched) };
}

const NO_WAIT_TEXT = "Unknown — no provider-published review time was found during research.";

export interface IntegrityResult {
  draft: GuideDraft;
  sources: Source[];
  corrections: string[];
}

/**
 * Enforce evidence rules on a generated (or curated) draft. Never upgrades evidence; only
 * removes unsupported sources and downgrades claims that lack support.
 */
export function enforceEvidence(
  input: GuideDraft,
  opts: { mode: "generated" | "curated"; ledger?: RetrievalLedger; curatedSources?: Source[] },
): IntegrityResult {
  const draft: GuideDraft = structuredClone(input);
  const corrections: string[] = [];

  // 1. Sources: generated sources must have been retrieved during this research run.
  const seen = new Set<string>();
  const sources: Source[] = [];
  const inputSources: (DraftSource | Source)[] =
    opts.mode === "curated" ? (opts.curatedSources ?? []) : draft.sources;
  for (const s of inputSources) {
    if (seen.has(s.id)) {
      corrections.push(`Removed duplicate source id [${s.id}].`);
      continue;
    }
    if (opts.mode === "curated") {
      seen.add(s.id);
      sources.push(s as Source);
      continue;
    }
    const n = normalizeUrl(s.url);
    const ledger = opts.ledger ?? { fetched: new Set(), searched: new Set() };
    if (n && ledger.fetched.has(n)) {
      seen.add(s.id);
      sources.push({ ...s, retrieval: "fetched" });
    } else if (n && ledger.searched.has(n)) {
      seen.add(s.id);
      sources.push({ ...s, retrieval: "search-result" });
    } else {
      corrections.push(`Dropped source [${s.id}] ${s.url} — it was not retrieved during research.`);
    }
  }
  const valid = new Map(sources.map((s) => [s.id, s]));

  const fix = (c: Claim, where: string, allowTested: boolean) => {
    c.sourceIds = [...new Set(c.sourceIds)].filter((id) => valid.has(id));
    if (c.evidence === "tested" && !allowTested) {
      c.evidence = "inference";
      c.note = appendNote(c.note, "Agent cannot perform hands-on tests; relabelled as inference.");
      corrections.push(`${where}: "tested" relabelled as inference (generated guides cannot claim tests).`);
    }
    if (c.evidence === "sourced" && c.sourceIds.length === 0) {
      c.evidence = "inference";
      c.note = appendNote(c.note, "No retrieved source supports this claim; treat as unverified.");
      corrections.push(`${where}: "sourced" claim had no valid source; downgraded to inference.`);
    }
  };
  const allowTested = opts.mode === "curated";

  fix(draft.difficulty.rationale, "Difficulty rationale", allowTested);
  fix(draft.handsOnEffort, "Hands-on effort", allowTested);
  draft.approval.triggers.forEach((c, i) => fix(c, `Approval trigger ${i + 1}`, allowTested));
  draft.approval.process.forEach((c, i) => fix(c, `Approval step ${i + 1}`, allowTested));
  fix(draft.approval.wait, "Approval wait", allowTested);
  fix(draft.composioManaged, "Composio managed auth", allowTested);
  draft.prerequisites.forEach((c, i) => fix(c, `Prerequisite ${i + 1}`, allowTested));
  draft.steps.forEach((c, i) => fix(c, `Step ${i + 1}`, allowTested));
  draft.nuances.forEach((c, i) => fix(c, `Nuance ${i + 1}`, allowTested));
  draft.blockers.forEach((b, i) => fix(b.resolution, `Blocker ${i + 1}`, allowTested));

  // 2. External approval waits must never be invented.
  const wait = draft.approval.wait;
  const waitHasFetchedSource =
    opts.mode === "curated" || wait.sourceIds.some((id) => valid.get(id)?.retrieval === "fetched");
  if (wait.evidence === "estimate" || (wait.evidence === "inference" && draft.approval.required !== "none")) {
    corrections.push(`Approval wait: unsourced ${wait.evidence} removed ("${truncate(wait.text, 120)}").`);
    draft.approval.wait = {
      text: NO_WAIT_TEXT,
      evidence: "unknown",
      sourceIds: [],
      note: `The agent's unsourced guess was removed: "${truncate(wait.text, 200)}"`,
    };
  } else if (wait.evidence === "sourced" && !waitHasFetchedSource) {
    corrections.push("Approval wait: supported only by search snippets, not a fetched page; marked unknown.");
    draft.approval.wait = {
      text: NO_WAIT_TEXT,
      evidence: "unknown",
      sourceIds: [],
      note: `Only a search snippet suggested: "${truncate(wait.text, 200)}"`,
    };
  }

  // 3. Composio managed-auth status must be sourced to be anything but unknown.
  if (draft.composioManaged.status !== "unknown" && draft.composioManaged.evidence !== "sourced") {
    corrections.push(`Composio managed auth: "${draft.composioManaged.status}" was not sourced; set to unknown.`);
    draft.composioManaged = {
      status: "unknown",
      text: "Unknown — no retrieved source confirms whether Composio offers managed auth for this app. Check the toolkit's composio_managed_auth_schemes field.",
      evidence: "unknown",
      sourceIds: [],
      note: `The agent's unsourced claim was removed: "${truncate(draft.composioManaged.text, 200)}"`,
    };
  }

  draft.sources = sources.map(({ id, url, title, publisher }) => ({ id, url, title, publisher }));
  return { draft, sources, corrections };
}

function appendNote(note: string | undefined, add: string) {
  return note ? `${note} ${add}` : add;
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Counts by evidence kind, for summaries and tests. */
export function evidenceCounts(claims: Claim[]) {
  const counts: Record<string, number> = { tested: 0, sourced: 0, estimate: 0, inference: 0, unknown: 0 };
  for (const c of claims) counts[c.evidence]++;
  return counts;
}
