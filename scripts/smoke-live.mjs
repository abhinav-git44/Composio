#!/usr/bin/env node
/**
 * Live end-to-end check against a RUNNING server that has GEMINI_API_KEY or ANTHROPIC_API_KEY set.
 *   npm run build && npm start          (in one terminal, with your key in .env.local)
 *   npm run smoke:live -- "Linear"      (in another)
 *
 * Proves: real web retrieval happened, citations map to retrieved pages, evidence labels are
 * present, the guide persisted at a shareable URL. Prints a report to paste into
 * docs/evidence-validation.md. Exits non-zero on any failed check.
 */
const base = process.env.COMPASS_URL ?? "http://localhost:3000";
const query = process.argv[2] ?? "Linear";
const fails = [];
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) fails.push(msg);
};

const started = Date.now();
console.log(`Generating a guide for "${query}" via ${base} (force=true, bypasses cache)…\n`);
const res = await fetch(`${base}/api/generate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query, force: true }),
});
if (!res.ok) {
  console.error(`Request failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const events = [];
const decoder = new TextDecoder();
let buf = "";
for await (const chunk of res.body) {
  buf += decoder.decode(chunk, { stream: true });
  let i;
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 2);
    if (!line.startsWith("data: ")) continue;
    const ev = JSON.parse(line.slice(6));
    events.push(ev);
    const t = ((Date.now() - started) / 1000).toFixed(0).padStart(4);
    if (ev.type === "search") console.log(`${t}s  search  ${ev.query}`);
    else if (ev.type === "fetch_result") console.log(`${t}s  ${ev.ok ? "read  " : "FAILED"}  ${ev.url}${ev.error ? ` (${ev.error})` : ""}`);
    else if (ev.type === "status") console.log(`${t}s  ${ev.message}`);
    else if (ev.type !== "fetch" && ev.type !== "search_results" && ev.type !== "validating") console.log(`${t}s  ${JSON.stringify(ev)}`);
  }
}
const last = events.at(-1);
if (last?.type === "ambiguous") {
  console.log("\nAgent reported ambiguity:", last.candidates.map((c) => `${c.name} <${c.website}>`).join(", "));
  console.log("Re-run with one of those websites.");
  process.exit(2);
}
check(last?.type === "done", `stream ended with a saved guide (${last?.type})`);
if (last?.type !== "done") process.exit(1);

const url = `${base}/guides/${last.slug}`;
const g = await (await fetch(`${base}/api/guides/${last.slug}`)).json();
const page = await fetch(url);
console.log("");
check(page.status === 200, `guide page renders at ${url}`);
check(g.origin === "generated", `origin is "generated" (got ${g.origin})`);
check(g.research?.searches.length > 0, `agent ran web searches (${g.research?.searches.length})`);
check(g.research?.fetches.some((f) => f.ok), `agent read at least one page (${g.research?.fetches.filter((f) => f.ok).length})`);
check(g.sources.length > 0, `guide has sources (${g.sources.length})`);
check(g.sources.every((s) => s.retrieval === "fetched" || s.retrieval === "search-result"), "every source was retrieved in this run");

const claims = [
  g.difficulty.rationale, g.handsOnEffort, ...g.approval.triggers, ...g.approval.process, g.approval.wait,
  g.composioManaged, ...g.prerequisites, ...g.steps, ...g.nuances, ...g.blockers.map((b) => b.resolution),
];
const ids = new Set(g.sources.map((s) => s.id));
check(claims.every((c) => c.evidence !== "sourced" || (c.sourceIds.length && c.sourceIds.every((i) => ids.has(i)))), "every sourced claim cites a retrieved source");
check(claims.every((c) => c.evidence !== "tested"), "no claim is labelled tested");
check(["sourced", "unknown"].includes(g.approval.wait.evidence) || g.approval.required === "none", `approval wait is sourced or unknown (${g.approval.wait.evidence})`);
const counts = claims.reduce((m, c) => ((m[c.evidence] = (m[c.evidence] ?? 0) + 1), m), {});

console.log(`\n--- report (paste into docs/evidence-validation.md) ---
App: ${g.appName} (query "${query}")  ·  ${new Date().toISOString().slice(0, 10)}  ·  model ${g.research.model}
URL: ${url}
Duration: ${Math.round(g.research.durationMs / 1000)}s · searches ${g.research.searches.length} · pages read ${g.research.fetches.filter((f) => f.ok).length} · failed reads ${g.research.fetches.filter((f) => !f.ok).length}
Difficulty: ${g.difficulty.level} · approval: ${g.approval.required} · wait: [${g.approval.wait.evidence}] ${g.approval.wait.text}
Evidence mix: ${JSON.stringify(counts)}
Integrity corrections (${g.research.integrityCorrections.length}):
${g.research.integrityCorrections.map((c) => `  - ${c}`).join("\n") || "  (none)"}
Sources:
${g.sources.map((s) => `  [${s.id}] ${s.retrieval}  ${s.url}`).join("\n")}
Manual follow-up: open 2–3 sourced claims and confirm the linked page says what the guide says.`);

console.log(fails.length ? `\n${fails.length} check(s) FAILED` : "\nAll automated checks passed.");
process.exit(fails.length ? 1 : 0);
