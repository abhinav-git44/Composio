import Link from "next/link";
import type { GuideCard } from "@/lib/guides";
import { DifficultyBadge, EvidenceBadge, OriginBadge } from "./Badges";

export function GuideCardView({ card }: { card: GuideCard }) {
  return (
    <Link href={`/guides/${card.slug}`} className="card" data-testid={`card-${card.slug}`}>
      <h3>
        <span>{card.appName}</span>
        <DifficultyBadge level={card.difficulty} />
      </h3>
      <OriginBadge origin={card.origin} />
      <dl>
        <dt>Effort</dt>
        <dd>{card.effort}</dd>
        <dt>Wait</dt>
        <dd>
          {card.wait}
          <EvidenceBadge kind={card.waitEvidence} />
        </dd>
      </dl>
    </Link>
  );
}
