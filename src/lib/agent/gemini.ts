import { z } from "zod";
import type { ParsedQuery } from "../input";
import { AmbiguousReport, GuideDraft } from "../schema";
import { SYSTEM_PROMPT } from "./prompt";
import type { AgentErrorCode, AgentEvent, AgentOutcome } from "./types";

/**
 * Gemini research agent (free tier friendly).
 *
 * Phase 1 — research: Gemini with Google Search grounding + URL context. The API reports which
 *   queries ran (groundingMetadata.webSearchQueries), which pages grounded the answer
 *   (groundingChunks) and which URLs were actually read (urlContextMetadata). Those reports — not
 *   the model's own text — form the retrieval ledger used for citation checks.
 * Phase 2 — structuring: Gemini with a JSON response schema turns the notes into a GuideDraft,
 *   citing only source ids from the ledger. Output is validated with Zod and repaired once.
 */

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/** Minimal surface of @google/genai we use, so tests can inject a fake. */
export interface GeminiLike {
  models: {
    generateContent(req: {
      model: string;
      contents: string;
      config?: Record<string, unknown>;
    }): Promise<GeminiResponse>;
  };
}

export interface GeminiResponse {
  text?: string;
  candidates?: {
    finishReason?: string;
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
    };
    urlContextMetadata?: { urlMetadata?: { retrievedUrl?: string; urlRetrievalStatus?: string }[] };
  }[];
  promptFeedback?: { blockReason?: string };
}

const REDIRECT_HOST = "vertexaisearch.cloud.google.com";

/** Grounding links are Google redirect URLs; resolve them to the real page (fixed host only). */
export async function resolveRedirect(uri: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return null;
  }
  if (u.hostname !== REDIRECT_HOST) return u.protocol === "https:" || u.protocol === "http:" ? uri : null;
  try {
    const res = await fetchImpl(uri, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) });
    const loc = res.headers.get("location");
    if (!loc) return null;
    const target = new URL(loc, uri);
    return target.protocol === "https:" || target.protocol === "http:" ? target.toString() : null;
  } catch {
    return null;
  }
}

/** Gemini's responseJsonSchema accepts a JSON Schema subset; strip keywords it may reject. */
export function geminiSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  const DROP = new Set(["$schema", "default", "format", "pattern", "minLength", "maxLength", "additionalProperties", "exclusiveMinimum", "exclusiveMaximum"]);
  const clean = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) if (!DROP.has(k)) out[k] = clean(val);
      return out;
    }
    return v;
  };
  return clean(raw) as Record<string, unknown>;
}

const RESEARCH_INSTRUCTIONS = `${SYSTEM_PROMPT}

## Phase 1 of 2: research notes (no JSON yet)
Use Google Search, and read the most important official pages with URL context. Then write plain-text research notes.
The FIRST line must be exactly one of:
STATUS: FOUND
STATUS: AMBIGUOUS
STATUS: NOT_FOUND
Then, for FOUND: bullet-point findings, each ending with the full URL it came from in angle brackets <https://...>.
Cover: registration steps, redirect URIs, scopes, publishing/review requirements, review timelines (only if a page states them), rate limits or restrictions for unreviewed apps, Composio managed-auth status for this app, and anything you could not find.
For AMBIGUOUS: list 2–5 distinct products as "name | website | one-line description".
For NOT_FOUND: one line explaining why.`;

const STRUCTURE_INSTRUCTIONS = `${SYSTEM_PROMPT}

## Phase 2 of 2: convert research notes into the guide JSON
You are given research notes and a numbered list of RETRIEVED SOURCES. Cite only those source ids. In "sources", include exactly the entries you cite, copying id, url and title from the list and setting publisher (provider / composio / third-party).
A fact that appears in the notes without one of the retrieved URLs is "inference", not "sourced". Never use "tested". The approval wait must be "sourced" from a retrieved provider page, or "unknown".`;

function errorFrom(e: unknown): { code: AgentErrorCode; message: string } {
  const err = e as { status?: number; name?: string; message?: string };
  const msg = err?.message ?? "";
  if (err?.name === "AbortError" || /aborted|timed? ?out/i.test(msg)) return { code: "timeout", message: "Research took too long and was stopped." };
  if (err?.status === 401 || err?.status === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
    return { code: "auth", message: "The AI provider rejected the API key." };
  }
  if (err?.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) {
    return { code: "rate_limited", message: "The free AI quota is used up for now. Try again later." };
  }
  if ((err?.status ?? 0) >= 500) return { code: "provider_unavailable", message: "The AI provider is temporarily unavailable. Try again shortly." };
  if (err?.status === 400) return { code: "provider_error", message: "The AI provider rejected the request." };
  return { code: "provider_error", message: "The research agent failed unexpectedly." };
}

function issues(err: z.ZodError) {
  return err.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

function parseJson(text: string | undefined): unknown {
  if (!text) return undefined;
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

export async function runGeminiAgent(
  ai: GeminiLike,
  query: Extract<ParsedQuery, { ok: true }>,
  opts: { emit: (e: AgentEvent) => void; signal?: AbortSignal; model?: string; fetchImpl?: typeof fetch },
): Promise<AgentOutcome> {
  const { emit } = opts;
  const model = opts.model ?? DEFAULT_GEMINI_MODEL;
  const subject = query.kind === "url" ? `the app at this website: ${query.value}` : `the app named "${query.value}"`;
  const today = new Date().toISOString().slice(0, 10);

  // ---- Phase 1: research ----
  emit({ type: "status", message: `Searching the web and reading ${query.display}'s developer docs…` });
  let research: GeminiResponse;
  try {
    research = await ai.models.generateContent({
      model,
      contents: `Research how a developer registers their own OAuth app for ${subject} and gets it approved for production. Today is ${today}. Composio docs: https://docs.composio.dev/toolkits`,
      config: {
        systemInstruction: RESEARCH_INSTRUCTIONS,
        tools: [{ googleSearch: {} }, { urlContext: {} }],
        abortSignal: opts.signal,
        maxOutputTokens: 8000,
      },
    });
  } catch (e) {
    return { kind: "error", ...errorFrom(e) };
  }
  if (research.promptFeedback?.blockReason) {
    return { kind: "error", code: "refused", message: "The model declined to research this request." };
  }
  const notes = research.text ?? "";
  const cand = research.candidates?.[0];
  const searches = cand?.groundingMetadata?.webSearchQueries ?? [];
  for (const s of searches) emit({ type: "search", query: s });

  // Build the ledger from API metadata, resolving Google redirect links.
  const fetchImpl = opts.fetchImpl ?? fetch;
  const chunks = (cand?.groundingMetadata?.groundingChunks ?? []).map((c) => c.web).filter((w): w is { uri?: string; title?: string } => !!w?.uri);
  emit({ type: "search_results", count: chunks.length });
  const searched: { url: string; title: string }[] = [];
  for (const c of chunks.slice(0, 20)) {
    const real = await resolveRedirect(c.uri as string, fetchImpl);
    if (real) searched.push({ url: real, title: c.title || new URL(real).hostname });
  }
  const fetches: { url: string; ok: boolean; error?: string }[] = [];
  const fetched: string[] = [];
  for (const m of cand?.urlContextMetadata?.urlMetadata ?? []) {
    if (!m.retrievedUrl) continue;
    const real = (await resolveRedirect(m.retrievedUrl, fetchImpl)) ?? m.retrievedUrl;
    emit({ type: "fetch", url: real });
    const ok = m.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS";
    fetches.push(ok ? { url: real, ok } : { url: real, ok, error: (m.urlRetrievalStatus ?? "unknown").replace("URL_RETRIEVAL_STATUS_", "").toLowerCase() });
    emit({ type: "fetch_result", url: real, ok, error: ok ? undefined : fetches.at(-1)?.error });
    if (ok) fetched.push(real);
  }

  const status = /^\s*STATUS:\s*(FOUND|AMBIGUOUS|NOT_FOUND)/i.exec(notes)?.[1]?.toUpperCase();
  if (!notes.trim()) return { kind: "error", code: "no_result", message: "The agent returned no research notes." };

  if (status === "NOT_FOUND") {
    return { kind: "not_found", reason: notes.replace(/^\s*STATUS:.*\n?/i, "").trim().slice(0, 400) || "No matching app found." };
  }

  // Number every retrieved URL so phase 2 can only cite real retrievals.
  const catalog = new Map<string, { id: string; url: string; title: string; how: string }>();
  for (const url of fetched) if (!catalog.has(url)) catalog.set(url, { id: `s${catalog.size + 1}`, url, title: url, how: "read in full" });
  for (const s of searched) if (!catalog.has(s.url)) catalog.set(s.url, { id: `s${catalog.size + 1}`, url: s.url, title: s.title, how: "search result" });
  const sourceList = [...catalog.values()].map((s) => `${s.id} | ${s.url} | ${s.title} | ${s.how}`).join("\n") || "(none)";

  // ---- Phase 2: structure ----
  emit({ type: "status", message: "Writing the structured guide…" });
  const isAmbiguous = status === "AMBIGUOUS";
  const schema = isAmbiguous ? AmbiguousReport : GuideDraft;
  const base = `RESEARCH NOTES:\n${notes.slice(0, 30000)}\n\nRETRIEVED SOURCES (id | url | title | how):\n${sourceList}\n\n${
    isAmbiguous ? "Return the ambiguity report JSON (reason + 2–5 candidates)." : "Return the guide JSON."
  }`;
  let prompt = base;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: GeminiResponse;
    try {
      res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: STRUCTURE_INSTRUCTIONS,
          responseMimeType: "application/json",
          responseJsonSchema: geminiSchema(schema),
          abortSignal: opts.signal,
          maxOutputTokens: 16000,
        },
      });
    } catch (e) {
      return { kind: "error", ...errorFrom(e) };
    }
    emit({ type: "validating" });
    const parsed = schema.safeParse(parseJson(res.text));
    if (parsed.success) {
      if (isAmbiguous) return { kind: "ambiguous", report: parsed.data as AmbiguousReport };
      return {
        kind: "guide",
        draft: parsed.data as GuideDraft,
        fetched,
        searched: searched.map((s) => s.url),
        searches,
        fetches,
      };
    }
    if (attempt < 2) emit({ type: "status", message: "Output failed validation; asking the agent to fix it…" });
    const why = parsed.error ? issues(parsed.error) : "Response was not valid JSON.";
    prompt = `${base}\n\nYour previous JSON failed validation. Fix these problems and return the complete JSON again:\n${why}`;
  }
  return { kind: "error", code: "malformed_output", message: "The agent's guide failed validation after retries." };
}
