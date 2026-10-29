import type { Claim, Guide } from "./schema";

const LABEL: Record<Claim["evidence"], string> = {
  tested: "Tested",
  sourced: "Sourced",
  estimate: "Estimate",
  inference: "Inference",
  unknown: "Unknown",
};

const ORIGIN: Record<Guide["origin"], string> = {
  curated: "Curated: sources checked by a human reviewer",
  generated: "AI-generated: live research, citations checked automatically",
  fixture: "TEST FIXTURE: not real research",
};

/** Plain-markdown export for pasting into a ticket, doc or chat. */
export function guideToMarkdown(g: Guide, url?: string): string {
  const ref = (c: Claim) => {
    const ids = c.sourceIds.map((id) => g.sources.findIndex((s) => s.id === id) + 1).filter((n) => n > 0);
    const cites = ids.length ? ` ${ids.map((n) => `[${n}]`).join("")}` : "";
    return `${c.text} _(${LABEL[c.evidence]})_${cites}`;
  };
  const list = (cs: Claim[]) => cs.map((c) => `- ${ref(c)}`).join("\n");
  const out: string[] = [];
  out.push(`# ${g.appName}: OAuth app setup guide`);
  out.push(`${ORIGIN[g.origin]}. ${g.reviewedAt ? `Reviewed ${g.reviewedAt}` : `Generated ${g.createdAt.slice(0, 10)}`}.${url ? ` ${url}` : ""}`);
  out.push(g.summary);
  out.push(
    [
      `**Difficulty:** ${g.difficulty.level}: ${ref(g.difficulty.rationale)}`,
      `**Hands-on effort:** ${ref(g.handsOnEffort)}`,
      `**Approval:** ${g.approval.required}`,
      `**Approval wait:** ${ref(g.approval.wait)}`,
    ].join("  \n"),
  );
  if (g.prerequisites.length) out.push(`## Before you start\n${g.prerequisites.map((c) => `- [ ] ${ref(c)}`).join("\n")}`);
  out.push(
    `## Steps\n${g.steps
      .map((s, i) => `${i + 1}. **${s.title}** (${s.actor === "agent" ? "agent can do" : s.actor === "you" ? "you" : "agent or you"}): ${ref(s)}`)
      .join("\n")}`,
  );
  if (g.approval.triggers.length || g.approval.process.length) {
    out.push(`## Approval\n${list([...g.approval.triggers, ...g.approval.process])}`);
  }
  if (g.nuances.length) out.push(`## Watch out for\n${list(g.nuances)}`);
  if (g.blockers.length) out.push(`## If you get stuck\n${g.blockers.map((b) => `- **${b.problem}** ${ref(b.resolution)}`).join("\n")}`);
  out.push(`## Agent vs you\n**An agent can:**\n${g.agentCanDo.map((x) => `- ${x}`).join("\n")}\n\n**You must:**\n${g.youMustDo.map((x) => `- ${x}`).join("\n")}`);
  if (g.openQuestions.length) out.push(`## Still uncertain\n${g.openQuestions.map((x) => `- ${x}`).join("\n")}`);
  if (g.sources.length) out.push(`## Sources\n${g.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join("\n")}`);
  return out.join("\n\n") + "\n";
}
