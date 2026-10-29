import type { Guide } from "@/lib/schema";
import { c, COMPOSIO_CUSTOM, COMPOSIO_UNKNOWN, REVIEWED, src, step } from "../helpers";

export const slack: Guide = {
  schemaVersion: 1,
  slug: "slack",
  origin: "curated",
  createdAt: REVIEWED,
  reviewedAt: REVIEWED,
  appName: "Slack",
  vendor: "Slack Technologies (Salesforce)",
  website: "https://slack.com",
  oauthSupport: "yes",
  summary:
    "You can create a Slack app and distribute it to other workspaces the same day without review. The catch for AI agents: since May 2025, commercially distributed apps that aren't in the Slack Marketplace are limited to 1 request per minute (15 messages per call) on conversations.history and conversations.replies. Getting into the Marketplace needs 10 active workspaces and a review Slack says can take up to 10 weeks.",
  difficulty: {
    level: "moderate",
    rationale: c(
      "Creation and unlisted distribution are self-serve, but the read-history rate limits for unlisted apps make the Marketplace review hard to avoid for agents that read conversations.",
      "sourced",
      ["sl-dist", "sl-rate", "sl-review"],
    ),
  },
  handsOnEffort: c(
    "About 1–2 hours to create the app, set scopes and HTTPS redirect URLs, and activate public distribution. Marketplace preparation (test accounts, demo video, scope justifications) is extra.",
    "estimate",
  ),
  approval: {
    required: "conditional",
    triggers: [
      c("Listing in the Slack Marketplace requires review; unlisted public distribution doesn't describe a review step.", "sourced", ["sl-dist"]),
      c("You can only submit once the app is installed on at least 10 workspaces active in the past 28 days.", "sourced", ["sl-review"]),
    ],
    process: [
      c("Automated tests run before submission; failures must be fixed before you can submit.", "sourced", ["sl-review"]),
      c("Preliminary review checks listing info, docs, scope justifications and installability, without testing features.", "sourced", ["sl-review"]),
      c("Functional review tests features and scopes. Resubmitting during preliminary review resets your queue position.", "sourced", ["sl-review"]),
    ],
    wait: c(
      "Slack states preliminary review feedback within up to 10 business days, and functional review up to 10 weeks for new submissions (up to 6 weeks for published apps resubmitting changes). It can't be skipped or accelerated.",
      "sourced",
      ["sl-review"],
    ),
  },
  composioManaged: { ...COMPOSIO_UNKNOWN, status: "unknown" },
  prerequisites: [
    c("A Slack workspace to develop in (the app's home workspace).", "sourced", ["sl-dist"]),
    c("HTTPS endpoints for OAuth redirect URLs, interactivity and Events API request URLs.", "sourced", ["sl-dist"]),
    c("An OAuth 2.0 install flow, so each workspace and user gets its own token.", "sourced", ["sl-dist"]),
  ],
  steps: [
    step("Create the app", "you", c("Create a new app from the Slack app dashboard (api.slack.com/apps) in your development workspace.", "inference")),
    step(
      "Request only the scopes you need",
      "either",
      c(
        "Workspaces can restrict installs to admins, require approval, or allow only Marketplace apps, so minimal scopes matter. An agent can map your features to scopes.",
        "sourced",
        ["sl-dist"],
      ),
    ),
    step("Add HTTPS redirect URLs", "you", c("Add your auth layer's redirect URL under OAuth settings. Slack requires SSL for it.", "sourced", ["sl-dist"])),
    step(
      "Activate public distribution",
      "you",
      c(
        "Manage Distribution → 'Share Your App with Other Workspaces' → complete the checklist → 'Activate Public Distribution'. You get an Add to Slack button and a shareable install URL.",
        "sourced",
        ["sl-dist"],
      ),
    ),
    step("Connect it to your auth layer", "either", c("Create a custom auth config with the client ID and secret.", "sourced", ["cmp"])),
    step(
      "Decide whether you need the Marketplace",
      "you",
      c(
        "If your agent reads channel history, unlisted apps hit 1 request/min on conversations.history/replies. Marketplace apps and internal customer-built apps are exempt.",
        "sourced",
        ["sl-rate"],
      ),
    ),
    step(
      "Prepare a Marketplace submission",
      "either",
      c(
        "Provide test accounts with dummy data, scope justifications and (recommended) a demo video of install, OAuth, use and uninstall. An agent can draft justifications and the video script; you supply accounts and submit.",
        "sourced",
        ["sl-review"],
      ),
    ),
  ],
  nuances: [
    c(
      "Unlisted commercially distributed apps created on or after 29 May 2025: conversations.history and conversations.replies drop to Tier 1 (1 request/min) and max 15 objects per call.",
      "sourced",
      ["sl-rate"],
    ),
    c(
      "Apps using scopes beyond bot, incoming-webhook, commands and identify can be auto-uninstalled when the installing user leaves the workspace or becomes a guest.",
      "sourced",
      ["sl-dist"],
    ),
    c("Deactivating public distribution removes the app from every workspace except its home workspace.", "sourced", ["sl-dist"]),
    c("The Marketplace doesn't accept legacy or restricted scopes, broad workspace-data scopes, or coded-workflow scopes.", "sourced", ["sl-review"]),
  ],
  blockers: [
    {
      problem: "Your agent can only read a few messages per minute.",
      resolution: c(
        "That's the unlisted-app rate limit. Options: get Marketplace-listed, or have customers build an internal app in their own workspace.",
        "sourced",
        ["sl-rate"],
      ),
    },
    {
      problem: "Can't submit to the Marketplace yet.",
      resolution: c("You need 10 active workspaces first. Pilot with unlisted distribution to reach that.", "sourced", ["sl-review", "sl-dist"]),
    },
    {
      problem: "Install fails for workspaces other than yours.",
      resolution: c("Public distribution probably isn't activated; complete the Manage Distribution checklist.", "inference"),
    },
  ],
  agentCanDo: [
    "Map your agent's features to minimal scopes",
    "Draft scope justifications and listing copy",
    "Write a demo-video script for reviewers",
    "Track which workspaces count toward the 10-workspace bar",
  ],
  youMustDo: [
    "Create the app and activate distribution",
    "Host HTTPS endpoints",
    "Provide reviewer test accounts",
    "Submit to the Marketplace and answer reviewer feedback",
  ],
  openQuestions: [
    "Whether Composio offers managed auth for Slack, and if so whether that managed app is Marketplace-listed (which decides whether the history rate limit applies).",
  ],
  sources: [
    src("sl-dist", "https://docs.slack.dev/distribution", "Slack — App distribution", "provider"),
    src(
      "sl-rate",
      "https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps",
      "Slack changelog (29 May 2025): rate limit changes for non-Marketplace apps",
      "provider",
    ),
    src("sl-review", "https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide", "Slack Marketplace review guide", "provider"),
    COMPOSIO_CUSTOM,
  ],
};
