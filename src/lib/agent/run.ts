import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { AmbiguousReport, GuideDraft, NotFoundReport } from "../schema";
import type { ParsedQuery } from "../input";
import { SYSTEM_PROMPT, userPrompt } from "./prompt";
import type { AgentErrorCode, AgentEvent, AgentOutcome, ContentBlock, MessageParam, ModelClient } from "./types";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_TURNS = 10;
const MAX_REPAIRS = 2;

function jsonSchema(schema: z.ZodType) {
  const s = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete s.$schema;
  return s as Anthropic.Messages.Tool.InputSchema;
}

export function buildTools(): Anthropic.Messages.ToolUnion[] {
  return [
    { type: "web_search_20250305", name: "web_search", max_uses: 6 },
    {
      type: "web_fetch_20250910",
      name: "web_fetch",
      max_uses: 8,
      max_content_tokens: 12000,
    },
    {
      name: "submit_guide",
      description: "Submit the finished OAuth setup guide. Call exactly once, after research.",
      input_schema: jsonSchema(GuideDraft),
    },
    {
      name: "report_ambiguous",
      description: "Use instead of submit_guide when the app name matches several distinct products.",
      input_schema: jsonSchema(AmbiguousReport),
    },
    {
      name: "report_not_found",
      description: "Use when no product matching the query can be identified at all.",
      input_schema: jsonSchema(NotFoundReport),
    },
  ];
}

interface Ledger {
  fetched: string[];
  searched: string[];
  searches: string[];
  fetches: { url: string; ok: boolean; error?: string }[];
}

/** Interprets server-tool blocks: what the agent searched and what it actually retrieved. */
export function recordBlock(b: ContentBlock, ledger: Ledger, emit: (e: AgentEvent) => void, pending: Map<string, string>) {
  if (b.type === "server_tool_use") {
    const input = (b.input ?? {}) as { query?: unknown; url?: unknown };
    if (b.name === "web_search" && typeof input.query === "string") {
      ledger.searches.push(input.query);
      emit({ type: "search", query: input.query });
    } else if (b.name === "web_fetch" && typeof input.url === "string") {
      pending.set(b.id, input.url);
      emit({ type: "fetch", url: input.url });
    }
  } else if (b.type === "web_search_tool_result") {
    if (Array.isArray(b.content)) {
      for (const r of b.content) if (r.type === "web_search_result") ledger.searched.push(r.url);
      emit({ type: "search_results", count: b.content.length });
    } else {
      emit({ type: "status", message: `Search failed (${b.content.error_code}).` });
    }
  } else if (b.type === "web_fetch_tool_result") {
    const requested = pending.get(b.tool_use_id) ?? "";
    if (b.content.type === "web_fetch_result") {
      ledger.fetched.push(b.content.url);
      if (requested && requested !== b.content.url) ledger.fetched.push(requested);
      ledger.fetches.push({ url: b.content.url, ok: true });
      emit({ type: "fetch_result", url: b.content.url, ok: true });
    } else {
      ledger.fetches.push({ url: requested, ok: false, error: b.content.error_code });
      emit({ type: "fetch_result", url: requested, ok: false, error: b.content.error_code });
    }
  }
}

function formatIssues(err: z.ZodError) {
  return err.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

export function classifyError(e: unknown): { code: AgentErrorCode; message: string } {
  const err = e as { status?: number; name?: string; message?: string; error?: { error?: { type?: string } } };
  if (err?.name === "AbortError" || /aborted|timeout/i.test(err?.message ?? "")) {
    return { code: "timeout", message: "Research took too long and was stopped." };
  }
  const status = err?.status;
  if (status === 401 || status === 403) return { code: "auth", message: "The AI provider rejected the API key." };
  if (status === 429) return { code: "rate_limited", message: "The AI provider is rate-limiting requests. Try again shortly." };
  if (status === 529 || (status && status >= 500)) {
    return { code: "provider_unavailable", message: "The AI provider is temporarily unavailable. Try again shortly." };
  }
  if (status === 400) return { code: "provider_error", message: "The AI provider rejected the request." };
  return { code: "provider_error", message: "The research agent failed unexpectedly." };
}

export async function runAgent(
  client: ModelClient,
  query: Extract<ParsedQuery, { ok: true }>,
  opts: { emit: (e: AgentEvent) => void; signal?: AbortSignal; model?: string },
): Promise<AgentOutcome> {
  const emit = opts.emit;
  const ledger: Ledger = { fetched: [], searched: [], searches: [], fetches: [] };
  const pending = new Map<string, string>();
  const tools = buildTools();
  const messages: MessageParam[] = [{ role: "user", content: userPrompt(query) }];
  let repairs = 0;

  emit({ type: "status", message: `Researching ${query.display}…` });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let msg;
    try {
      msg = await client.createMessage(
        {
          model: opts.model ?? DEFAULT_MODEL,
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          tools,
          messages,
        },
        { onBlock: (b) => recordBlock(b, ledger, emit, pending), signal: opts.signal },
      );
    } catch (e) {
      const { code, message } = classifyError(e);
      return { kind: "error", code, message };
    }

    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.stop_reason === "refusal") {
      return { kind: "error", code: "refused", message: "The model declined to research this request." };
    }

    const call = msg.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock =>
        b.type === "tool_use" && ["submit_guide", "report_ambiguous", "report_not_found"].includes(b.name),
    );

    if (!call) {
      if (repairs >= MAX_REPAIRS) break;
      repairs++;
      messages.push({ role: "assistant", content: msg.content.length ? msg.content : [{ type: "text", text: "(no output)" }] });
      messages.push({
        role: "user",
        content:
          msg.stop_reason === "max_tokens"
            ? "Your response was cut off. Call submit_guide now with a more concise guide."
            : "Finish now: call submit_guide (or report_ambiguous / report_not_found).",
      });
      continue;
    }

    emit({ type: "validating" });
    const schema = call.name === "submit_guide" ? GuideDraft : call.name === "report_ambiguous" ? AmbiguousReport : NotFoundReport;
    const parsed = schema.safeParse(call.input);
    if (parsed.success) {
      if (call.name === "report_ambiguous") return { kind: "ambiguous", report: parsed.data as AmbiguousReport };
      if (call.name === "report_not_found") return { kind: "not_found", reason: (parsed.data as { reason: string }).reason };
      return { kind: "guide", draft: parsed.data as GuideDraft, ...ledger };
    }

    if (repairs >= MAX_REPAIRS) {
      return { kind: "error", code: "malformed_output", message: "The agent's guide failed validation after retries." };
    }
    repairs++;
    emit({ type: "status", message: "Output failed validation; asking the agent to fix it…" });
    messages.push({ role: "assistant", content: msg.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: call.id,
          is_error: true,
          content: `Validation failed. Fix these fields and call ${call.name} again:\n${formatIssues(parsed.error)}`,
        },
      ],
    });
  }
  return { kind: "error", code: "no_result", message: "The agent finished without producing a guide." };
}
