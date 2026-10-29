import type { Claim, Guide } from "@/lib/schema";

export const EVIDENCE_LABEL: Record<Claim["evidence"], string> = {
  tested: "Tested",
  sourced: "Sourced",
  estimate: "Estimate",
  inference: "Inference",
  unknown: "Unknown",
};

export const EVIDENCE_HELP: Record<Claim["evidence"], string> = {
  tested: "Someone performed this against the real provider and observed the result.",
  sourced: "Stated by a linked source that was actually retrieved.",
  estimate: "An effort estimate by the guide author, not published by the provider.",
  inference: "A reasoned conclusion that no source states directly.",
  unknown: "Could not be determined.",
};

export function DifficultyBadge({ level }: { level: Guide["difficulty"]["level"] }) {
  return <span className={`badge d-${level}`}>{level}</span>;
}

export function EvidenceBadge({ kind }: { kind: Claim["evidence"] }) {
  return (
    <span className={`badge ev ev-${kind}`} title={EVIDENCE_HELP[kind]}>
      {EVIDENCE_LABEL[kind]}
    </span>
  );
}

export function OriginBadge({ origin }: { origin: Guide["origin"] }) {
  const label = origin === "curated" ? "Curated" : origin === "generated" ? "AI-generated" : "Test fixture";
  return <span className={`badge origin origin-${origin}`}>{label}</span>;
}

export function ClaimText({ claim, sources }: { claim: Claim; sources: Guide["sources"] }) {
  const refs = claim.sourceIds
    .map((id) => ({ id, n: sources.findIndex((s) => s.id === id) + 1 }))
    .filter((r) => r.n > 0);
  return (
    <>
      {claim.text}
      <EvidenceBadge kind={claim.evidence} />
      {refs.map((r) => (
        <a key={r.id} className="cite" href={`#source-${r.n}`} aria-label={`Source ${r.n}`}>
          [{r.n}]
        </a>
      ))}
      {claim.note ? <span className="claim-note">{claim.note}</span> : null}
    </>
  );
}

export function EvidenceLegend() {
  return (
    <ul className="legend" aria-label="Evidence labels">
      {(Object.keys(EVIDENCE_LABEL) as Claim["evidence"][]).map((k) => (
        <li key={k}>
          <EvidenceBadge kind={k} />
          <span className="muted">{EVIDENCE_HELP[k]}</span>
        </li>
      ))}
    </ul>
  );
}
