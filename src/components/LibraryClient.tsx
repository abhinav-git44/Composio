"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GuideCard } from "@/lib/guides";
import { GuideCardView } from "./GuideCardView";

type LiveMode = "anthropic" | "gemini" | "fixture" | "unconfigured";

type ProgressItem = { id: number; text: string; tone?: "ok" | "fail" };
type Candidate = { name: string; website: string; description: string };

const ERROR_TEXT: Record<string, string> = {
  not_configured: "Live generation isn't configured on this server. Browse the curated library instead.",
  rate_limited: "Too many requests right now. Wait a minute and try again.",
  auth: "The server's AI provider key was rejected. The site owner needs to fix the configuration.",
  provider_unavailable: "The AI provider is temporarily unavailable. Try again in a minute.",
  malformed_output: "The agent produced a guide that failed validation, so nothing was saved. Try again.",
  timeout: "Research took too long and was stopped. Try a more specific name or the app's website.",
};

function matches(card: GuideCard, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [card.appName, card.vendor, card.slug].some((x) => x.toLowerCase().includes(s));
}

export function LibraryClient({
  curated,
  generated,
  mode,
  durable,
}: {
  curated: GuideCard[];
  generated: GuideCard[];
  mode: LiveMode;
  durable: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{ reason: string; list: Candidate[] } | null>(null);
  const idRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const cur = useMemo(() => curated.filter((c) => matches(c, query)), [curated, query]);
  const gen = useMemo(() => generated.filter((c) => matches(c, query)), [generated, query]);
  const trimmed = query.trim();

  const log = (text: string, tone?: ProgressItem["tone"]) =>
    setProgress((p) => [...p, { id: ++idRef.current, text, tone }]);

  async function generate(target: string) {
    if (busy || target.trim().length < 2) return;
    setBusy(true);
    setError(null);
    setCandidates(null);
    setProgress([]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let finished = false;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: target }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        setError(ERROR_TEXT[body.error] ?? body.message ?? `Request failed (${res.status}).`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          switch (ev.type) {
            case "status":
              log(String(ev.message));
              break;
            case "search":
              log(`Searching: “${ev.query}”`);
              break;
            case "search_results":
              log(`${ev.count} results`);
              break;
            case "fetch":
              log(`Reading ${ev.url}`);
              break;
            case "fetch_result":
              if (!ev.ok) log(`Couldn't read ${ev.url || "page"} (${ev.error})`, "fail");
              break;
            case "validating":
              log("Validating the guide…");
              break;
            case "done":
              finished = true;
              log(ev.cached ? "Found an existing guide for this app." : "Guide saved.", "ok");
              router.push(`/guides/${ev.slug}`);
              return;
            case "ambiguous":
              finished = true;
              setCandidates({ reason: String(ev.reason), list: ev.candidates as Candidate[] });
              return;
            case "not_found":
              finished = true;
              setError(`Couldn't identify that app: ${ev.reason}`);
              return;
            case "error":
              finished = true;
              setError(ERROR_TEXT[String(ev.code)] ?? String(ev.message));
              return;
          }
        }
      }
      if (!finished) setError("The connection closed before the guide was ready. Try again.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Network error while generating. Check your connection and try again.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <>
      <section className="panel" id="generate" aria-labelledby="find-h">
        <h2 id="find-h">Find or generate a guide</h2>
        <form
          className="search-row"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (cur.length + gen.length === 1 && trimmed) {
              router.push(`/guides/${(cur[0] ?? gen[0]).slug}`);
            } else if (trimmed && cur.length + gen.length === 0) {
              generate(trimmed);
            }
          }}
        >
          <label htmlFor="q" className="sr-only">
            App name or website
          </label>
          <input
            id="q"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="App name or website, e.g. Slack, linear.app"
            autoComplete="off"
            maxLength={200}
            disabled={busy}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => generate(trimmed)}
            disabled={busy || trimmed.length < 2 || mode === "unconfigured"}
          >
            {busy ? "Researching…" : trimmed ? `Generate guide for “${trimmed.slice(0, 24)}${trimmed.length > 24 ? "…" : ""}”` : "Generate guide"}
          </button>
          {busy ? (
            <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          ) : null}
        </form>
        <p className="hint">
          Typing filters the library below. For an app that isn&apos;t listed, an agent searches and reads the provider&apos;s docs
          live (usually 1–3 minutes) and saves a shareable guide.
        </p>
        {mode === "unconfigured" ? (
          <div className="warn-box" role="status">
            Live generation is off on this deployment (no AI provider key configured). The curated guides still work.
          </div>
        ) : null}
        {mode === "fixture" ? (
          <div className="warn-box" role="status">
            Test mode: generation replays a scripted fixture. It does not research real apps.
          </div>
        ) : null}
        {!durable ? (
          <div className="warn-box" role="status">
            Generated guides on this deployment are stored temporarily and may disappear after a restart.
          </div>
        ) : null}
        {progress.length ? (
          <div className="progress" aria-live="polite" data-testid="progress">
            <ol>
              {progress.map((p) => (
                <li key={p.id} style={p.tone === "fail" ? { color: "var(--hard)" } : p.tone === "ok" ? { color: "var(--easy)" } : undefined}>
                  {p.text}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {error ? (
          <div className="error-box" role="alert">
            {error}
          </div>
        ) : null}
        {candidates ? (
          <div className="warn-box" role="status" data-testid="ambiguous">
            <strong>Which one did you mean?</strong> {candidates.reason}
            <div className="candidates">
              {candidates.list.map((c) => (
                <button key={c.website} type="button" className="btn btn-sm" onClick={() => generate(c.website)}>
                  {c.name}: <span className="muted">{c.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="section" id="library" aria-labelledby="lib-h">
        <h2 id="lib-h">Curated library</h2>
        <p className="muted small">Sources checked by a human reviewer. Each claim is labelled sourced, estimate, inference or unknown.</p>
        {cur.length ? (
          <div className="grid">
            {cur.map((c) => (
              <GuideCardView key={c.slug} card={c} />
            ))}
          </div>
        ) : (
          <p className="empty">No curated guide matches “{trimmed}”. Generate one above.</p>
        )}
      </section>

      <section className="section" aria-labelledby="gen-h">
        <h2 id="gen-h">Recently generated</h2>
        <p className="muted small">Produced by the live agent. Citations are checked automatically against the pages it actually retrieved.</p>
        {gen.length ? (
          <div className="grid">
            {gen.map((c) => (
              <GuideCardView key={c.slug} card={c} />
            ))}
          </div>
        ) : (
          <p className="empty">{generated.length ? `No generated guide matches “${trimmed}”.` : "None yet."}</p>
        )}
      </section>
    </>
  );
}
