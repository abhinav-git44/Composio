import type Anthropic from "@anthropic-ai/sdk";
import type { AmbiguousReport, GuideDraft } from "../schema";

export type ContentBlock = Anthropic.Messages.ContentBlock;
export type Message = Anthropic.Messages.Message;
export type MessageParam = Anthropic.Messages.MessageParam;
export type MessageParams = Anthropic.Messages.MessageStreamParams;

/** Thin seam over the Anthropic SDK so the agent loop can be tested without network access. */
export interface ModelClient {
  readonly label: string;
  createMessage(
    params: MessageParams,
    hooks: { onBlock: (b: ContentBlock) => void; signal?: AbortSignal },
  ): Promise<Message>;
}

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "search"; query: string }
  | { type: "search_results"; count: number }
  | { type: "fetch"; url: string }
  | { type: "fetch_result"; url: string; ok: boolean; error?: string }
  | { type: "validating" };

export type AgentErrorCode =
  | "not_configured"
  | "auth"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_error"
  | "malformed_output"
  | "no_result"
  | "refused"
  | "timeout";

export type AgentOutcome =
  | {
      kind: "guide";
      draft: GuideDraft;
      /** Model(s) actually used, when the backend picks among several. */
      model?: string;
      fetched: string[];
      searched: string[];
      searches: string[];
      fetches: { url: string; ok: boolean; error?: string }[];
    }
  | { kind: "ambiguous"; report: AmbiguousReport }
  | { kind: "not_found"; reason: string }
  | { kind: "error"; code: AgentErrorCode; message: string; detail?: string };
