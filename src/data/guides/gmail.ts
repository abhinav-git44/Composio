import type { Guide } from "@/lib/schema";
import { c, COMPOSIO_CUSTOM, COMPOSIO_UNKNOWN, REVIEWED, src, step } from "../helpers";

export const gmail: Guide = {
  schemaVersion: 1,
  slug: "google-gmail",
  origin: "curated",
  createdAt: REVIEWED,
  reviewedAt: REVIEWED,
  appName: "Gmail (Google)",
  vendor: "Google",
  website: "https://developers.google.com/workspace/gmail",
  oauthSupport: "yes",
  summary:
    "You can have a working Gmail OAuth client in testing mode within an hour, but only for up to 100 listed test users, and their tokens expire after 7 days. Reading or modifying mail uses restricted scopes, so production means Google verification (which Google says can take several weeks) plus an annual third-party security assessment.",
  difficulty: {
    level: "hard",
    rationale: c(
      "Reading, composing and modifying mail are all restricted scopes, which require verification and an annual CASA security assessment.",
      "sourced",
      ["g-scopes", "g-restricted", "g-casa"],
    ),
  },
  handsOnEffort: c(
    "About 1 hour for a testing-mode client. Verification prep (homepage and privacy policy on a verified domain, demo video, scope justification) is likely several days of work, plus whatever the security assessment asks you to fix.",
    "estimate",
  ),
  approval: {
    required: "always",
    triggers: [
      c("Apps requesting sensitive or restricted scopes must pass OAuth verification before access is granted to the public.", "sourced", ["g-verify"]),
      c("Unverified apps showing the warning screen are capped at 100 new users in total.", "sourced", ["g-unverified"]),
      c("Accessing restricted-scope data from or through a third-party server requires a security assessment.", "sourced", ["g-restricted"]),
    ],
    process: [
      c("Verify ownership of every authorized domain in Google Search Console (Owner or Editor).", "sourced", ["g-restricted", "g-req"]),
      c("Publish branding (app name, support email, homepage, privacy policy), then request data access in the Verification Center.", "sourced", ["g-restricted"]),
      c("Submit an unlisted YouTube demo video and a justification for each restricted scope.", "sourced", ["g-restricted", "g-req"]),
      c("Pass a CASA security assessment by a Google-empanelled assessor (tier AL1 or AL2).", "sourced", ["g-casa"]),
      c("Re-verify and reassess at least every 12 months.", "sourced", ["g-restricted", "g-casa"]),
    ],
    wait: c(
      "Google says restricted-scope verification can take several weeks. Brand verification is usually minutes when automated, 2–3 business days if branding changed. The security assessment's duration isn't published.",
      "sourced",
      ["g-restricted"],
    ),
  },
  composioManaged: {
    ...COMPOSIO_UNKNOWN,
    status: "unknown",
  },
  prerequisites: [
    c("A Google Cloud project with the Gmail API enabled.", "inference"),
    c("A domain you own, verified in Google Search Console.", "sourced", ["g-req"]),
    c("A public homepage and a privacy policy on that domain, meeting Google's Limited Use requirements.", "sourced", ["g-restricted", "g-req"]),
  ],
  steps: [
    step(
      "Pick the narrowest scopes",
      "either",
      c(
        "gmail.labels is non-sensitive; gmail.send is sensitive; readonly, compose, modify, metadata, insert, settings.basic and mail.google.com are restricted. An agent can map features to scopes.",
        "sourced",
        ["g-scopes"],
      ),
    ),
    step(
      "Configure the consent screen",
      "you",
      c(
        "Choose External (any Google user) or Internal (only your Google Cloud organization's members). Internal-only apps are exempt from verification.",
        "sourced",
        ["g-testing", "g-restricted"],
      ),
    ),
    step("Start in Testing", "you", c("Add up to 100 test users; they can authorize without verification.", "sourced", ["g-testing"])),
    step("Create the OAuth client", "you", c("Create a web-application OAuth client ID with your auth layer's redirect URI, then copy the ID and secret.", "inference")),
    step("Connect it to your auth layer", "either", c("Use a custom auth config with your client, and request the scopes you chose.", "sourced", ["cmp", "cmp-gmail"])),
    step(
      "Prepare verification materials",
      "agent",
      c(
        "Draft the homepage copy, privacy policy (Limited Use disclosure), scope justifications and demo-video script. You review and publish them.",
        "sourced",
        ["g-restricted", "g-req"],
      ),
    ),
    step("Verify your domain and submit", "you", c("Verify domains in Search Console, publish branding, then submit data-access verification.", "sourced", ["g-restricted"])),
    step("Complete the security assessment", "you", c("Work with a Google-empanelled assessor under CASA when Google's Trust & Safety team contacts you.", "sourced", ["g-casa"])),
  ],
  nuances: [
    c("In Testing, authorizations (including refresh tokens) expire 7 days after consent.", "sourced", ["g-testing"]),
    c("Testing is capped at 100 test users, and each added user uses quota permanently.", "sourced", ["g-testing"]),
    c("https://mail.google.com/ is only needed to permanently delete mail; everything else works with narrower scopes.", "sourced", ["g-scopes"]),
    c("gmail.metadata never returns message bodies.", "sourced", ["g-scopes"]),
    c("Adding a new restricted scope later may require a fresh security assessment.", "sourced", ["g-restricted"]),
    c("Who pays for the CASA assessment, and how much, isn't stated on the Google pages reviewed.", "unknown"),
  ],
  blockers: [
    {
      problem: "Users see 'Google hasn't verified this app'.",
      resolution: c("Keep them as test users while in Testing, or complete verification. Unverified apps are capped at 100 new users.", "sourced", ["g-unverified", "g-testing"]),
    },
    {
      problem: "invalid_grant after a week.",
      resolution: c("Testing-mode tokens expire after 7 days. Move to production (with verification) to get long-lived tokens.", "sourced", ["g-testing"]),
    },
    {
      problem: "Verification rejected over scope justification.",
      resolution: c("Request the narrowest scopes and explain in detail why narrower ones won't work.", "sourced", ["g-req"]),
    },
    {
      problem: "org_internal error for outside users.",
      resolution: c("The consent screen uses the Internal user type; switch to External to serve other organizations.", "sourced", ["g-testing"]),
    },
  ],
  agentCanDo: [
    "Map features to the narrowest Gmail scopes",
    "Draft the privacy policy and Limited Use disclosure",
    "Write scope justifications and the demo-video script",
    "Track the annual re-verification date",
  ],
  youMustDo: [
    "Own and verify the domain in Search Console",
    "Publish the homepage and privacy policy",
    "Record and submit the demo video",
    "Contract the CASA assessor and remediate findings",
  ],
  openQuestions: [
    "CASA assessment cost and typical duration (not published on the pages reviewed).",
    "Whether Composio's managed Google app (if any) covers the restricted scopes you need.",
  ],
  sources: [
    src("g-scopes", "https://developers.google.com/workspace/gmail/api/auth/scopes", "Choose Gmail API scopes", "provider"),
    src("g-verify", "https://support.google.com/cloud/answer/13463073", "OAuth App Verification Help Center", "provider"),
    src("g-req", "https://support.google.com/cloud/answer/13464321", "Verification requirements", "provider"),
    src(
      "g-restricted",
      "https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification",
      "Restricted scope verification",
      "provider",
    ),
    src("g-casa", "https://support.google.com/cloud/answer/13465431", "Security Assessment", "provider"),
    src("g-unverified", "https://support.google.com/cloud/answer/7454865", "Unverified apps", "provider"),
    src("g-testing", "https://support.google.com/cloud/answer/15549945", "Manage App Audience (publishing status, test users)", "provider"),
    COMPOSIO_CUSTOM,
    src("cmp-gmail", "https://docs.composio.dev/kb/guide/toolkits-gmail", "Composio KB — Gmail toolkit", "composio"),
  ],
};
