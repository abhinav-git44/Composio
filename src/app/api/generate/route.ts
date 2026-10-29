import { generateGuide, liveMode } from "@/lib/generate";
import { parseQuery } from "@/lib/input";
import { acquire, checkRate } from "@/lib/rate-limit";
import type { AgentEvent } from "@/lib/agent/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type StreamEvent =
  | AgentEvent
  | { type: "done"; slug: string; cached: boolean }
  | { type: "ambiguous"; reason: string; candidates: { name: string; website: string; description: string }[] }
  | { type: "not_found"; reason: string }
  | { type: "error"; code: string; message: string; detail?: string };

function json(status: number, body: object, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export async function POST(req: Request) {
  const ctype = req.headers.get("content-type") ?? "";
  if (!ctype.includes("application/json")) return json(415, { error: "unsupported_media_type", message: "Send JSON." });

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 2000) return json(413, { error: "too_large", message: "Request body too large." });
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "invalid_json", message: "Request body must be valid JSON." });
  }
  const { query: rawQuery, force } = (body ?? {}) as { query?: unknown; force?: unknown };
  const query = parseQuery(rawQuery);
  if (!query.ok) return json(400, { error: "invalid_query", message: query.error });

  if (liveMode() === "unconfigured") {
    return json(503, {
      error: "not_configured",
      message: "Live generation isn't configured on this server. The curated library still works.",
    });
  }

  const limit = checkRate(clientIp(req));
  if (!limit.ok) {
    return json(429, { error: "rate_limited", message: limit.reason }, { "Retry-After": String(limit.retryAfterSec) });
  }

  const release = acquire();
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 280_000);
  req.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* client went away */
        }
      };
      try {
        const result = await generateGuide(query, { emit: send, signal: abort.signal, force: force === true });
        if (result.kind === "guide") send({ type: "done", slug: result.slug, cached: result.cached });
        else if (result.kind === "ambiguous") send({ type: "ambiguous", ...result.report });
        else if (result.kind === "not_found") send({ type: "not_found", reason: result.reason });
        else send({ type: "error", code: result.code, message: result.message, detail: result.detail });
      } catch (e) {
        console.error("generate failed", e instanceof Error ? e.message : "unknown");
        send({ type: "error", code: "internal", message: "Something went wrong while generating the guide." });
      } finally {
        clearTimeout(timer);
        release();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export function GET() {
  return json(405, { error: "method_not_allowed", message: "Use POST." }, { Allow: "POST" });
}
