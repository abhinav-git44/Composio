import type { Guide } from "@/lib/schema";
import { c, COMPOSIO_CUSTOM, COMPOSIO_UNKNOWN, REVIEWED, src, step } from "../helpers";

export const github: Guide = {
  schemaVersion: 1,
  slug: "github",
  origin: "curated",
  createdAt: REVIEWED,
  reviewedAt: REVIEWED,
  appName: "GitHub",
  vendor: "GitHub, Inc.",
  website: "https://github.com",
  oauthSupport: "yes",
  summary:
    "Registering a GitHub OAuth app is a self-serve form with no GitHub review step described in its docs. The real decisions are whether you want an OAuth app or a GitHub App (GitHub prefers GitHub Apps), and how to handle organizations, which block unapproved OAuth apps by default.",
  difficulty: {
    level: "easy",
    rationale: c(
      "Self-serve registration from Developer settings; the creation docs describe no review or approval step.",
      "inference",
      ["gh-create"],
      "Based on the absence of any review step in GitHub's creation docs.",
    ),
  },
  handsOnEffort: c("About 10–20 minutes to register the app and copy credentials into your auth config.", "estimate"),
  approval: {
    required: "conditional",
    triggers: [
      c(
        "There's no GitHub-side review, but each customer organization with OAuth app access restrictions must approve your app before it can reach that org's data. Restrictions are on by default for new organizations.",
        "sourced",
        ["gh-restrict"],
      ),
    ],
    process: [
      c(
        "Members can't grant an unapproved OAuth app access to org resources themselves; they can request approval, and org owners are notified.",
        "sourced",
        ["gh-restrict"],
      ),
    ],
    wait: c(
      "No provider review. How long a customer organization takes to approve your app is up to its owners; GitHub publishes no timeline.",
      "unknown",
    ),
  },
  composioManaged: { ...COMPOSIO_UNKNOWN, status: "unknown" },
  prerequisites: [
    c("A GitHub account (personal or organization) to own the app.", "sourced", ["gh-create"]),
    c("A homepage URL and the authorization callback URL your auth layer (for example Composio) gives you.", "sourced", ["gh-create", "cmp"]),
  ],
  steps: [
    step(
      "Choose OAuth app vs GitHub App",
      "you",
      c(
        "GitHub generally prefers GitHub Apps: fine-grained permissions, per-repository access chosen by the installer, short-lived tokens. OAuth apps can only act on behalf of a user and use broad scopes.",
        "sourced",
        ["gh-diff", "gh-decide"],
      ),
    ),
    step(
      "Open Developer settings",
      "you",
      c("Profile picture → Settings → Developer settings → OAuth apps → New OAuth App (or 'Register a new application').", "sourced", ["gh-create"]),
    ),
    step(
      "Fill in the registration form",
      "either",
      c(
        "Application name, homepage URL, optional description, and authorization callback URL. Tick 'Enable Device Flow' only if you need it. An agent can prepare these values; you submit them.",
        "sourced",
        ["gh-create"],
      ),
    ),
    step(
      "Add extra redirect URIs if needed",
      "you",
      c("Since August 2026, OAuth apps can register up to 10 redirect (callback) URIs via 'Add redirect URI'.", "sourced", ["gh-changelog"]),
    ),
    step(
      "Create a client secret",
      "you",
      c("After registering, generate a client secret and copy it with the client ID. Store it in a secrets manager, never in code.", "inference"),
    ),
    step(
      "Decide on token expiry",
      "you",
      c(
        "New apps get short-lived tokens by default: 8-hour access tokens with 6-month refresh tokens. Make sure your stack refreshes them, or opt out in optional features.",
        "sourced",
        ["gh-changelog"],
      ),
    ),
    step(
      "Connect it to your auth layer",
      "either",
      c("Create a custom auth config with the client ID and secret, then pass its ID when connecting users.", "sourced", ["cmp"]),
    ),
  ],
  nuances: [
    c(
      "OAuth scopes are coarse: reading repository contents requires the `repo` scope, which also grants write access.",
      "sourced",
      ["gh-decide"],
    ),
    c("OAuth app tokens share the user's limit of 5,000 requests per hour; GitHub App limits scale with installation size.", "sourced", ["gh-diff"]),
    c(
      "Docs disagree on token lifetime: the comparison page still says OAuth tokens are long-lived by default, but the August 2026 changelog makes expiring tokens the default for new apps.",
      "sourced",
      ["gh-diff", "gh-changelog"],
      "Trust the newer changelog for new apps; existing apps may still use long-lived tokens.",
    ),
    c(
      "Wildcard redirect matching (subdomains/sub-paths) is now visible per URI. GitHub advises turning it off where you don't need it.",
      "sourced",
      ["gh-changelog"],
    ),
  ],
  blockers: [
    {
      problem: "Users can't see their organization's repositories after connecting.",
      resolution: c("The org has OAuth app access restrictions. An org owner must approve your app; members can request it.", "sourced", ["gh-restrict"]),
    },
    {
      problem: "Connections break after about 8 hours.",
      resolution: c("Your app issues expiring tokens. Implement refresh-token handling or opt out for that app.", "sourced", ["gh-changelog"]),
    },
    {
      problem: "redirect_uri mismatch during authorization.",
      resolution: c("Register the exact callback URL your auth layer uses (or add it as an extra redirect URI).", "inference"),
    },
  ],
  agentCanDo: [
    "Collect the current docs and changelog entries",
    "Prepare the registration field values and description",
    "Recommend the narrowest scopes for your use case",
    "Generate a checklist for org owners approving your app",
  ],
  youMustDo: [
    "Sign in (with 2FA) and register the app",
    "Generate and securely store the client secret",
    "Decide between an OAuth app and a GitHub App",
    "Approve the app in organizations you own",
  ],
  openQuestions: [
    "Whether Composio offers managed auth for GitHub, and whether its GitHub toolkit expects an OAuth app or a GitHub App.",
    "The registration-steps page cited is the GitHub Enterprise Server 3.19 version; the github.com page wasn't retrievable during review, though the steps match.",
  ],
  sources: [
    src(
      "gh-create",
      "https://docs.github.com/en/enterprise-server@3.19/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app",
      "Creating an OAuth app (GitHub Enterprise Server 3.19 docs)",
      "provider",
    ),
    src(
      "gh-diff",
      "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps",
      "About GitHub Apps and OAuth apps",
      "provider",
    ),
    src(
      "gh-decide",
      "https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app",
      "Deciding when to build a GitHub App",
      "provider",
    ),
    src(
      "gh-restrict",
      "https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/about-oauth-app-access-restrictions",
      "About OAuth app access restrictions",
      "provider",
    ),
    src(
      "gh-changelog",
      "https://github.blog/changelog/2026-08-14-multiple-redirect-uris-and-token-refresh-for-oauth-apps",
      "Changelog (14 Aug 2026): multiple redirect URIs and token refresh for OAuth apps",
      "provider",
    ),
    COMPOSIO_CUSTOM,
  ],
};
