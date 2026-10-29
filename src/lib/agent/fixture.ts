import type { ContentBlock, Message, ModelClient } from "./types";

/**
 * TEST FIXTURE — NOT REAL RESEARCH.
 *
 * Replays a scripted conversation through the real agent loop so the UI, persistence and
 * integrity checks can be exercised without an API key. Only enabled when
 * COMPASS_AGENT_MODE=fixture. Guides it produces are stored with origin "fixture" and
 * the UI labels them as test data. All URLs point at example.com.
 */
export function createFixtureClient(): ModelClient {
  let call = 0;
  return {
    label: "fixture",
    async createMessage(params, { onBlock }) {
      call++;
      const first = params.messages[0];
      const prompt = typeof first.content === "string" ? first.content : "";
      const ambiguous = /"mercury"/i.test(prompt);
      const blocks: ContentBlock[] = call === 1 ? scriptedResearch() : [];
      const tool = ambiguous ? ambiguousCall() : submitCall();
      const content = [...blocks, tool] as ContentBlock[];
      for (const b of content) onBlock(b);
      await new Promise((r) => setTimeout(r, 150));
      return {
        id: `msg_fixture_${call}`,
        type: "message",
        role: "assistant",
        model: "fixture",
        content,
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      } as unknown as Message;
    },
  };
}

function scriptedResearch(): ContentBlock[] {
  return [
    { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "Acme Notes OAuth app developer docs" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "srv_1",
      content: [
        { type: "web_search_result", url: "https://example.com/acme/developers/oauth", title: "Acme OAuth (fixture)", encrypted_content: "x", page_age: null },
        { type: "web_search_result", url: "https://example.com/acme/blog", title: "Acme blog (fixture)", encrypted_content: "x", page_age: null },
      ],
    },
    { type: "server_tool_use", id: "srv_2", name: "web_fetch", input: { url: "https://example.com/acme/developers/oauth" } },
    {
      type: "web_fetch_tool_result",
      tool_use_id: "srv_2",
      content: {
        type: "web_fetch_result",
        url: "https://example.com/acme/developers/oauth",
        retrieved_at: new Date().toISOString(),
        content: { type: "document", source: { type: "text", media_type: "text/plain", data: "fixture" }, title: "Acme OAuth", citations: null },
      },
    },
    { type: "server_tool_use", id: "srv_3", name: "web_fetch", input: { url: "https://example.com/acme/missing" } },
    { type: "web_fetch_tool_result", tool_use_id: "srv_3", content: { type: "web_fetch_tool_result_error", error_code: "url_not_accessible" } },
  ] as unknown as ContentBlock[];
}

function submitCall() {
  const c = (text: string, evidence: string, sourceIds: string[] = []) => ({ text, evidence, sourceIds });
  return {
    type: "tool_use",
    id: "toolu_fixture_submit",
    name: "submit_guide",
    input: {
      appName: "Acme Notes (fixture)",
      vendor: "Acme Inc. (fictional)",
      website: "https://example.com/acme",
      oauthSupport: "yes",
      summary: "FIXTURE DATA for automated tests. Acme Notes is a fictional app; nothing here describes a real provider.",
      difficulty: { level: "moderate", rationale: c("Self-serve registration; listing in the directory requires review.", "sourced", ["s1"]) },
      handsOnEffort: c("About 30–60 minutes to register and configure.", "estimate"),
      approval: {
        required: "conditional",
        triggers: [c("Review is needed only to appear in the public directory.", "sourced", ["s1"])],
        process: [c("Submit the listing form from the developer console.", "sourced", ["s1"])],
        // Deliberately unsourced guess: integrity checks must strip it.
        wait: c("Usually about 2 weeks.", "estimate"),
      },
      composioManaged: { ...c("Composio lists Acme as managed.", "inference"), status: "available" },
      prerequisites: [c("An Acme developer account.", "sourced", ["s1"])],
      steps: [
        { ...c("Open the developer console and create an OAuth app.", "sourced", ["s1"]), title: "Create the app", actor: "you" },
        { ...c("Add your redirect URI exactly as your auth provider specifies.", "sourced", ["s1"]), title: "Set redirect URI", actor: "you" },
        { ...c("Draft listing copy and a privacy policy summary.", "inference"), title: "Prepare listing", actor: "agent" },
      ],
      nuances: [
        // Deliberately cites a source that was never retrieved: must be downgraded.
        c("Tokens expire after 1 hour.", "sourced", ["s9"]),
        c("The blog mentions a beta API.", "sourced", ["s2"]),
      ],
      blockers: [{ problem: "Redirect URI mismatch", resolution: c("Copy the URI exactly, including trailing slash.", "inference") }],
      agentCanDo: ["Collect documentation links", "Draft the listing description"],
      youMustDo: ["Sign in to the developer console", "Accept the developer terms"],
      openQuestions: ["Whether directory review is required for private distribution."],
      sources: [
        { id: "s1", url: "https://example.com/acme/developers/oauth", title: "Acme OAuth (fixture)", publisher: "provider" },
        { id: "s2", url: "https://example.com/acme/blog", title: "Acme blog (fixture)", publisher: "provider" },
        { id: "s9", url: "https://example.com/never-retrieved", title: "Never retrieved", publisher: "third-party" },
      ],
    },
  };
}

function ambiguousCall() {
  return {
    type: "tool_use",
    id: "toolu_fixture_ambiguous",
    name: "report_ambiguous",
    input: {
      reason: "FIXTURE: 'Mercury' matches several products.",
      candidates: [
        { name: "Mercury (banking, fixture)", website: "https://example.com/mercury-bank", description: "Fictional fixture candidate A." },
        { name: "Mercury (editor, fixture)", website: "https://example.com/mercury-editor", description: "Fictional fixture candidate B." },
      ],
    },
  };
}
