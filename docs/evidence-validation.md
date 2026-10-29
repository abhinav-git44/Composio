# Evidence validation

What was checked, how, and what the results were. Only checks that actually ran are recorded. Anything not run is
listed under **Not verified**.

Review date: 2026-10-29. Environment: cloud sandbox, Node 22, Next.js 16.4.3, Chromium (Playwright 1.63), no Anthropic
API key, and outbound web access only through the reviewer's own research tools (not from the app's server).

## 1. Curated guide sources (manual)

Every curated claim labelled "sourced" was compared against the cited page, read on 2026-10-29. The method: fetch the
page, extract the specific statement, and write the claim to match it. No provider account was used, and no app was
registered. **Nothing is labelled "tested".**

| Guide | Pages read | Claims sourced | Result |
|---|---|---|---|
| GitHub | 5 GitHub + 1 Composio | creation fields, GitHub App preference, org access restrictions, token expiry, redirect URIs, rate limits | Supported, with corrections below |
| Slack | 3 Slack + 1 Composio | distribution checklist, non-Marketplace rate limits, Marketplace requirements and timelines | Supported |
| Gmail | 7 Google + 2 Composio | scope classes, verification triggers, 100-user cap, testing limits, CASA, timelines | Supported, with gaps marked unknown |
| Notion | 3 Notion + 2 Composio | public connection setup, token exchange/refresh, Marketplace review and timeline | Supported, with an ambiguity flagged |

Automated guardrail: `tests/unit/curated.test.ts` runs every curated guide through the same integrity rules as generated
guides. Result: **0 corrections**, every sourced claim cites an existing source, every source is cited, and no approval
wait is an estimate.

### What the research corrected or changed

- **GitHub redirect URIs: older docs are outdated.** The GitHub Enterprise Server 3.19 "Creating an OAuth app" page
  says OAuth apps support **one** callback URL. GitHub's changelog of 14 Aug 2026 says OAuth apps can now register
  **up to 10**. The guide uses the changelog.
- **GitHub token lifetime: the docs conflict.** The "About GitHub Apps and OAuth apps" page says OAuth tokens are
  long-lived by default with optional expiry. The same changelog says expiring tokens (8 h access, 6 mo refresh) are
  **on by default for new apps**. The guide states the conflict instead of picking one silently.
- **GitHub "no review" was downgraded from sourced to inference.** No GitHub page says "no review". The creation docs
  simply describe none, so the claim is labelled an inference with that explanation.
- **GitHub creation steps come from the Enterprise Server 3.19 page.** The github.com version wasn't retrievable during
  review. This is disclosed in the guide's open questions.
- **Slack: the biggest practical finding was not about approval.** Unlisted, commercially distributed apps created
  after 29 May 2025 get 1 request/min and 15 objects per call on `conversations.history` and `conversations.replies`.
  That makes the Marketplace route (10 active workspaces, review up to 10 weeks) close to mandatory for agents that
  read history. This became the guide's headline.
- **Gmail: the "unverified app" user cap.** Google's restricted-scope page mentions a cap without a number; the
  "Unverified apps" page states "100 new users in total". The guide cites the page that has the number.
- **Gmail: CASA cost is not on Google's pages.** Third-party sites quote prices, but they weren't used. Marked unknown.
- **Gmail: the testing-mode page was retrieved in Spanish** (`answer/15549945?hl=es`). The cited claims (100 test users,
  7-day expiry) were translated and cited against the canonical URL.
- **Notion: an ambiguity was kept, not resolved.** The Marketplace guide says public connections "work independently"
  of listings, but the Authorization page says the auth URL populates after the connection is "submitted". Whether
  that is a human review gate is unclear, so it is listed as an open question.
- **Composio managed auth: unknown for all four apps.** The managed-auth directory page renders its list client-side
  (it showed "Loading toolkits…"), and the per-toolkit KB pages don't say. Composio documents checking
  `composio_managed_auth_schemes` via the API, which needs an account. No guide claims availability either way.

## 2. Automated tests (all ran, all pass)

| Suite | Command | Result |
|---|---|---|
| Lint | `npm run lint` | 0 errors, 0 warnings |
| Types | `npm run typecheck` | 0 errors |
| Unit and integration | `npm test` | **88 / 88 pass** |
| Production build | `npm run build` | passes |
| End-to-end (prod build, Chromium) | `npm run e2e` | **16 / 16 pass** (desktop 1280×900 + Pixel 7) |
| Secret leakage | `npm run check:secrets` | pass: canary key absent from `.next/static` and from about 280 KB of HTTP responses; no `NEXT_PUBLIC_` usage; no `X-Powered-By` |

What the e2e journeys cover: home page; search for "google", "github" and "slack" and open each guide; citation
anchors; external links with `rel=noopener`; recommender checkboxes; checklist persisting across reloads; Copy link,
Copy as Markdown, Share fallback and Print; all header and back links; 404s for unknown and malformed slugs; fixture
generation with progress, persistence across refresh and a fresh browser context, JSON API, and cache reuse; ambiguous
names with candidate buttons; invalid inputs (localhost, ports, `javascript:`, markup); API method and content-type
rejection; an unconfigured server (button disabled, banner, 503); no horizontal scroll at phone width.

Screenshots of desktop and mobile were reviewed by eye, which found defect D4 below.

## 3. Real API call (ran)

The production server was started with a deliberately invalid key, with `ANTHROPIC_BASE_URL` unset so the real
endpoint was used, then `POST /api/generate {"query":"Linear"}` was sent.

- Result: the stream emitted `status` then `{"type":"error","code":"auth","message":"The AI provider rejected the API key."}`.
- This proves the Anthropic SDK path reaches `api.anthropic.com` and that auth failures map to a clear message.
- The key string did not appear in the server log.
- It does **not** prove that the tool definitions are accepted or that research succeeds. Those need a valid key.

## 4. Defects found by these checks and fixed

| # | Defect | Found by | Fix |
|---|---|---|---|
| D1 | `javascript:alert(1)` accepted as an "app name" (the name regex allowed `:` and `(`) | unit test | Any `scheme:` prefix is treated as a URL, and non-http(s) schemes are rejected with a clear message. `:` removed from names. |
| D2 | Names like "Yahoo!" rejected | e2e | `!` allowed in names. |
| D3 | `next/font/google` would fetch fonts at build time (fails offline and in restricted CI) | build review | Switched to a system font stack. |
| D4 | After the validator neutralised an unsourced "Composio manages this app" claim, the original text still displayed next to status "unknown" | screenshot review | The text is replaced with an explicit unknown; the agent's claim moves to a visible note. Regression tests added (unit and e2e). |
| D5 | Vitest config loaded as CommonJS (Vite deprecation warning) | test output | Renamed to `vitest.config.mts`. |
| D6 | `npm run typecheck` failed on a fresh clone (Next route types like `PageProps` exist only after type generation) | clean-state re-run | Script now runs `next typegen` before `tsc`. |

## 5. Live generation: NOT verified

**A real, successful live generation has not been run.** No Anthropic API key was available in the build environment,
and the reviewer chose not to handle the owner's key.

What stands in for it, and what each piece proves:

- The **fixture client** drives the real agent loop, validator, store, API route and UI with scripted Anthropic-shaped
  blocks (search → results → fetch → fetch error → submit). This proves the pipeline and the integrity rules. It does
  **not** prove retrieval. Fixture guides are stored with `origin: "fixture"` and carry a red "Test fixture" label.
- **Mock clients** cover malformed output and repair, repeated malformed output, no tool call, `pause_turn`, refusal,
  HTTP 400/401/429/500/529, aborts, and search errors.
- **The real-API invalid-key test** (section 3).

How to close this gap (about 2 minutes):

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run build && npm start
npm run smoke:live -- "Linear"        # in a second terminal; try also "Calendly" and "Xero"
```

`smoke:live` fails unless the guide's origin is `generated`, the agent ran searches **and** read at least one page,
every source was retrieved in that run, every sourced claim cites one, nothing is "tested", and the approval wait is
sourced or unknown. It prints a report block. Paste it below, then open 2–3 sourced claims and confirm the linked page
supports them.

### Live runs

_None recorded yet._

## 6. Other things not verified

- Upstash storage: implemented, not exercised (no account). File storage is tested.
- Deployment to Vercel, including `maxDuration = 300`, is not done.
- Real-device mobile testing: only Chromium mobile emulation.
- Screen-reader testing: semantic structure and labels only; no assistive-technology run.
- The rate limiter is per instance, and was tested in-process only.
