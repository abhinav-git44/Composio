import type { GuideDraft } from "@/lib/schema";

export function makeDraft(overrides: Partial<GuideDraft> = {}): GuideDraft {
  return {
    appName: "TestApp",
    vendor: "Test Inc",
    website: "https://testapp.example.org",
    oauthSupport: "yes",
    summary: "A test guide.",
    difficulty: { level: "moderate", rationale: { text: "Review needed for listing.", evidence: "sourced", sourceIds: ["s1"] } },
    handsOnEffort: { text: "About an hour.", evidence: "estimate", sourceIds: [] },
    approval: {
      required: "conditional",
      triggers: [{ text: "Listing needs review.", evidence: "sourced", sourceIds: ["s1"] }],
      process: [],
      wait: { text: "Review takes up to 5 business days.", evidence: "sourced", sourceIds: ["s1"] },
    },
    composioManaged: { text: "Not confirmed.", evidence: "unknown", sourceIds: [], status: "unknown" },
    prerequisites: [],
    steps: [{ title: "Create app", actor: "you", text: "Create it in the console.", evidence: "sourced", sourceIds: ["s1"] }],
    nuances: [],
    blockers: [],
    agentCanDo: ["Research"],
    youMustDo: ["Sign in"],
    openQuestions: [],
    sources: [
      { id: "s1", url: "https://docs.testapp.example.org/oauth", title: "OAuth docs", publisher: "provider" },
      { id: "s2", url: "https://blog.example.org/post", title: "Blog", publisher: "third-party" },
    ],
    ...overrides,
  };
}
