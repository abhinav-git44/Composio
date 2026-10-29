import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ModelClient } from "./types";

/** Real client. Research happens via Anthropic's server-side web_search / web_fetch tools. */
export function createAnthropicClient(apiKey: string): ModelClient {
  const sdk = new Anthropic({ apiKey, maxRetries: 2, timeout: 180_000 });
  return {
    label: "anthropic",
    async createMessage(params, { onBlock, signal }) {
      const stream = sdk.messages.stream(params, { signal });
      stream.on("contentBlock", onBlock);
      return stream.finalMessage();
    },
  };
}
