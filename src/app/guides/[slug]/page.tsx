import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimText, DifficultyBadge, EvidenceBadge, EvidenceLegend, OriginBadge } from "@/components/Badges";
import { Checklist } from "@/components/Checklist";
import { GuideActions } from "@/components/GuideActions";
import { Recommender } from "@/components/Recommender";
import { getGuide } from "@/lib/guides";
import { guideToMarkdown } from "@/lib/markdown";
import { SLUG_RE } from "@/lib/slug";

export const dynamic = "force-dynamic";

const APPROVAL_TEXT = {
  none: "No provider review",
  conditional: "Only in some cases",
  always: "Yes, for production",
  unknown: "Unknown",
} as const;

const ACTOR_TEXT = { agent: "Agent can do", you: "You", either: "Agent or you" } as const;

export async function generateMetadata(props: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const g = SLUG_RE.test(slug) ? await getGuide(slug) : null;
  if (!g) return { title: "Guide not found" };
  return {
    title: `${g.appName} OAuth app setup`,
    description: g.summary.slice(0, 200),
    robots: g.origin === "curated" ? undefined : { index: false },
  };
}

export default async function GuidePage(props: PageProps<"/guides/[slug]">) {
  const { slug } = await props.params;
  if (!SLUG_RE.test(slug)) notFound();
  const g = await getGuide(slug);
  if (!g) notFound();

  const S = g.sources;
  const date = g.reviewedAt ? `Sources checked ${g.reviewedAt}` : `Generated ${new Date(g.createdAt).toISOString().slice(0, 10)}`;

  return (
    <article data-testid="guide">
      <p className="small">
        <Link href="/">← All guides</Link>
      </p>

      {g.origin === "fixture" ? (
        <div className="warn-box" role="note">
          <strong>Test fixture.</strong> This guide was produced by a scripted test client, not real research. Nothing in it
          describes a real provider.
        </div>
      ) : null}
      {g.origin === "generated" ? (
        <div className="warn-box" role="note">
          <strong>AI-generated from live research.</strong> Every citation was checked against pages the agent actually
          retrieved, and unsupported claims were downgraded. No human has reviewed this guide yet, and no setup steps were
          performed. Verify against the linked sources before relying on it.
        </div>
      ) : null}

      <div className="guide-head">
        <div>
          <h1>{g.appName}: OAuth app setup</h1>
          <div className="guide-meta">
            <OriginBadge origin={g.origin} />
            <span>{g.vendor}</span>
            <a href={g.website} target="_blank" rel="noopener noreferrer">
              {new URL(g.website).hostname.replace(/^www\./, "")}
            </a>
            <span>{date}</span>
          </div>
        </div>
        <GuideActions title={`${g.appName} OAuth app setup`} markdown={guideToMarkdown(g, "{{URL}}")} />
      </div>

      <p className="lede" style={{ marginTop: 16 }}>
        {g.summary}
      </p>

      {g.oauthSupport !== "yes" ? (
        <div className="warn-box" role="note">
          {g.oauthSupport === "no"
            ? "This app doesn't appear to offer third-party OAuth. See the steps for the alternative."
            : "It's unclear whether this app supports third-party OAuth. See the open questions."}
        </div>
      ) : null}

      <div className="verdict" data-testid="verdict">
        <div>
          <div className="label">Difficulty</div>
          <div className="value">
            <DifficultyBadge level={g.difficulty.level} />
          </div>
          <p className="small" style={{ margin: "8px 0 0" }}>
            <ClaimText claim={g.difficulty.rationale} sources={S} />
          </p>
        </div>
        <div>
          <div className="label">Hands-on effort</div>
          <div className="small">
            <ClaimText claim={g.handsOnEffort} sources={S} />
          </div>
        </div>
        <div>
          <div className="label">Provider approval</div>
          <div className="value">{APPROVAL_TEXT[g.approval.required]}</div>
        </div>
        <div data-testid="wait">
          <div className="label">Approval wait</div>
          <div className="small">
            <ClaimText claim={g.approval.wait} sources={S} />
          </div>
        </div>
      </div>

      <Recommender guide={{ appName: g.appName, composioManaged: g.composioManaged, approval: g.approval, difficulty: g.difficulty }} />

      <div className="two-col">
        <section className="panel" aria-labelledby="pre-h">
          <h2 id="pre-h">Before you start</h2>
          {g.prerequisites.length ? (
            <Checklist
              storageKey={`compass:prereq:${g.slug}`}
              items={g.prerequisites.map((c, i) => ({ id: String(i), content: <ClaimText claim={c} sources={S} /> }))}
            />
          ) : (
            <p className="empty">None identified.</p>
          )}
        </section>
        <section className="panel" aria-labelledby="split-h">
          <h2 id="split-h">What an agent can do vs what you must do</h2>
          <h3>An agent can</h3>
          <ul className="claims small">
            {g.agentCanDo.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <h3>You must</h3>
          <ul className="claims small">
            {g.youMustDo.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel" aria-labelledby="steps-h">
        <h2 id="steps-h">Steps</h2>
        <ol className="steps">
          {g.steps.map((s, i) => (
            <li key={i}>
              <h3>
                {s.title}
                <span className={`actor actor-${s.actor}`}>{ACTOR_TEXT[s.actor]}</span>
              </h3>
              <ClaimText claim={s} sources={S} />
            </li>
          ))}
        </ol>
      </section>

      <section className="panel" aria-labelledby="appr-h">
        <h2 id="appr-h">Approval and review</h2>
        {g.approval.triggers.length ? (
          <>
            <h3>When review applies</h3>
            <ul className="claims">
              {g.approval.triggers.map((c, i) => (
                <li key={i}>
                  <ClaimText claim={c} sources={S} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {g.approval.process.length ? (
          <>
            <h3>What the process involves</h3>
            <ul className="claims">
              {g.approval.process.map((c, i) => (
                <li key={i}>
                  <ClaimText claim={c} sources={S} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <h3>How long you&apos;ll wait</h3>
        <p>
          <ClaimText claim={g.approval.wait} sources={S} />
        </p>
        <h3>Managed auth availability</h3>
        <p>
          <ClaimText claim={g.composioManaged} sources={S} />
        </p>
      </section>

      <div className="two-col">
        <section className="panel" aria-labelledby="nu-h">
          <h2 id="nu-h">Watch out for</h2>
          {g.nuances.length ? (
            <ul className="claims">
              {g.nuances.map((c, i) => (
                <li key={i}>
                  <ClaimText claim={c} sources={S} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">None identified.</p>
          )}
        </section>
        <section className="panel" aria-labelledby="bl-h">
          <h2 id="bl-h">If you get stuck</h2>
          {g.blockers.length ? (
            <ul className="claims">
              {g.blockers.map((b, i) => (
                <li key={i}>
                  <strong>{b.problem}</strong> <ClaimText claim={b.resolution} sources={S} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">None identified.</p>
          )}
        </section>
      </div>

      <section className="panel" aria-labelledby="oq-h">
        <h2 id="oq-h">Still uncertain</h2>
        {g.openQuestions.length ? (
          <ul className="claims">
            {g.openQuestions.map((q) => (
              <li key={q}>
                {q} <EvidenceBadge kind="unknown" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Nothing flagged.</p>
        )}
      </section>

      <section className="panel" aria-labelledby="src-h">
        <h2 id="src-h">Sources</h2>
        {S.length ? (
          <ol className="sources">
            {S.map((s, i) => (
              <li key={s.id} id={`source-${i + 1}`}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>{" "}
                <span className="muted small">
                  · {s.publisher}
                  {s.retrieval === "fetched" ? " · read by agent" : s.retrieval === "search-result" ? " · search result only" : ""}
                  {s.retrieval === "curator-checked" && s.checkedAt ? ` · checked ${s.checkedAt}` : ""}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">No sources survived citation checks.</p>
        )}
      </section>

      {g.research ? (
        <section className="panel" aria-labelledby="tr-h" data-testid="research-trace">
          <h2 id="tr-h">Research trace</h2>
          <p className="small muted">
            Model: {g.research.model} · {g.research.searches.length} searches · {g.research.fetches.filter((f) => f.ok).length} pages
            read · {g.research.fetches.filter((f) => !f.ok).length} failed reads · {Math.round(g.research.durationMs / 1000)}s
          </p>
          <details>
            <summary>Searches and pages</summary>
            <ul className="trace">
              {g.research.searches.map((q, i) => (
                <li key={`q${i}`}>Searched “{q}”</li>
              ))}
              {g.research.fetches.map((f, i) => (
                <li key={`f${i}`}>
                  {f.ok ? "Read" : `Failed (${f.error})`} {f.url}
                </li>
              ))}
            </ul>
          </details>
          <details open={g.research.integrityCorrections.length > 0}>
            <summary>Automatic integrity corrections ({g.research.integrityCorrections.length})</summary>
            {g.research.integrityCorrections.length ? (
              <ul className="trace" data-testid="corrections">
                {g.research.integrityCorrections.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="small muted">Every cited source had been retrieved, so nothing needed correcting.</p>
            )}
          </details>
        </section>
      ) : null}

      <section className="panel no-print">
        <h2>Evidence labels</h2>
        <EvidenceLegend />
      </section>
    </article>
  );
}
