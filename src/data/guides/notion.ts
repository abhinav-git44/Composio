import type { Guide } from "@/lib/schema";
import { c, COMPOSIO_CUSTOM, COMPOSIO_UNKNOWN, REVIEWED, src, step } from "../helpers";

export const notion: Guide = {
  schemaVersion: 1,
  slug: "notion",
  origin: "curated",
  createdAt: REVIEWED,
  reviewedAt: REVIEWED,
  appName: "Notion",
  vendor: "Notion Labs",
  website: "https://www.notion.com",
  oauthSupport: "yes",
  summary:
    "Notion's public connections are self-serve, and Notion says they work without a Marketplace listing. Two things to get right up front: the installation scope (any workspace vs selected workspaces) can't be changed later, and users only grant access to the pages they pick. One open question: the authorization docs say the auth URL appears after you 'submit' the connection, without saying whether that involves a review.",
  difficulty: {
    level: "easy",
    rationale: c(
      "Creation is self-serve in the Developer portal, and Marketplace listing is optional.",
      "sourced",
      ["n-public", "n-market"],
    ),
  },
  handsOnEffort: c("About 30–60 minutes to create the connection and wire up the token exchange.", "estimate"),
  approval: {
    required: "conditional",
    triggers: [
      c("A Marketplace listing is reviewed by Notion staff, but listing is optional; public connections work without one.", "sourced", ["n-market"]),
      c("The authorization docs say the Authorization URL populates after the connection is submitted; whether that is a review gate isn't stated.", "sourced", ["n-auth"]),
    ],
    process: [
      c("Listing requires an 'Any workspace' public connection plus name, description, category, tags, images and logo.", "sourced", ["n-market"]),
      c("Rejections can stem from brand/trademark issues, quality, or baseline criteria; you can revise and resubmit.", "sourced", ["n-market"]),
    ],
    wait: c(
      "For Marketplace listings, Notion says to expect a reply within 5–10 business days by email (a response, not a guaranteed decision). No listing is needed just to use OAuth.",
      "sourced",
      ["n-market"],
    ),
  },
  composioManaged: { ...COMPOSIO_UNKNOWN, status: "unknown" },
  prerequisites: [
    c("A Notion workspace to develop in.", "sourced", ["n-public"]),
    c("Your auth layer's redirect URI.", "sourced", ["n-public"]),
  ],
  steps: [
    step(
      "Create a public connection",
      "you",
      c("Developer portal (app.notion.com/developers/connections) → Build → Public connections → new connection.", "sourced", ["n-public"]),
    ),
    step(
      "Choose the installation scope carefully",
      "you",
      c("'Any workspace' (Marketplace-eligible) or 'Selected workspaces only'. This can't be changed after creation.", "sourced", ["n-public", "n-market"]),
    ),
    step("Add redirect URIs and capabilities", "either", c("Add redirect URIs and the capabilities you need (read, update, insert content).", "sourced", ["n-public"])),
    step("Copy credentials", "you", c("Copy the OAuth client ID and secret from the Configuration tab.", "sourced", ["n-public"])),
    step(
      "Submit the connection",
      "you",
      c("The Authorization URL field populates after submission.", "sourced", ["n-auth"], "The docs don't say whether submission involves human review."),
    ),
    step(
      "Wire up the token exchange",
      "either",
      c(
        "POST to https://api.notion.com/v1/oauth/token with HTTP Basic auth. Refreshing returns a new access and refresh token pair; store both.",
        "sourced",
        ["n-auth"],
      ),
    ),
    step("Optional: list on the Marketplace", "you", c("Create a listing under Listings and submit it for review.", "sourced", ["n-market"])),
  ],
  nuances: [
    c("Users pick which pages to share during OAuth; your agent sees only those pages.", "sourced", ["n-public"]),
    c("redirect_uri is required in the token request if you sent it in the auth URL or registered more than one URI.", "sourced", ["n-auth"]),
    c("Several Composio auth configs sharing one Notion integration can end up with overlapping page access.", "sourced", ["cmp-notion"]),
    c("Access-token lifetime isn't stated on the authorization page reviewed.", "unknown"),
  ],
  blockers: [
    {
      problem: "The agent can't find a page the user expects.",
      resolution: c("The user didn't share it in the page picker. Ask them to reconnect and select it.", "inference", ["n-public"]),
    },
    {
      problem: "Can't list the connection on the Marketplace.",
      resolution: c("Only 'Any workspace' connections can be listed, and scope is fixed at creation. Create a new connection.", "sourced", ["n-market"]),
    },
  ],
  agentCanDo: ["Draft listing copy and choose capabilities", "Prepare redirect URIs and token-exchange code", "Explain the page picker to your users"],
  youMustDo: ["Create the connection and pick the installation scope", "Copy and store the client secret", "Submit the connection (and listing, if wanted)"],
  openQuestions: [
    "Whether submitting a public connection triggers a human review, and how long it takes.",
    "Access-token lifetime.",
    "Whether Composio offers managed auth for Notion.",
  ],
  sources: [
    src("n-public", "https://developers.notion.com/guides/get-started/public-connections", "Notion — Public connections", "provider"),
    src("n-auth", "https://developers.notion.com/docs/authorization", "Notion — Authorization", "provider"),
    src("n-market", "https://developers.notion.com/guides/get-started/marketplace-listing", "Notion — Marketplace listing", "provider"),
    COMPOSIO_CUSTOM,
    src("cmp-notion", "https://docs.composio.dev/kb/guide/toolkits-notion", "Composio KB — Notion toolkit", "composio"),
  ],
};
