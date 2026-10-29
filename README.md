# OAuth Compass

**How long until your users can connect?** Before an AI agent can act in a user's Gmail, Slack or GitHub, the developer
usually needs their own OAuth app, and sometimes the provider's approval. OAuth Compass gives each app a shareable
guide: how hard setup is, the developer's hands-on effort **kept separate from** the provider's approval wait, what
triggers review, common blockers, which steps an agent can do and which need the developer, and what is still unknown.

- **Curated library:** GitHub (easy), Notion (easy), Slack (moderate), Gmail (hard), each source-checked by hand.
- **Live generation:** type any app name or website, and an agent researches the provider's docs with web search and
  web fetch, then saves a guide at a shareable URL.
- **Evidence labels on every claim:** sourced, estimate, inference, unknown (and tested, which nothing currently claims).
  Code, not the model, enforces them.

## Quick start

```bash
npm install
cp .env.example .env.local          # add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to enable live generation
npm run dev                         # http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | One of the two keys, for live generation | **Free tier, no card** (aistudio.google.com). Uses Google Search grounding plus URL context. Server-side only. |
| `ANTHROPIC_API_KEY` | One of the two keys, for live generation | Paid. Uses Claude web search and web fetch. Server-side only. |
| `GEMINI_MODEL` / `ANTHROPIC_MODEL` | No | Defaults: `gemini-3.8-flash` (structuring) / `claude-sonnet-5-5`. |
| `GEMINI_RESEARCH_MODELS` | No | Comma-separated research models tried in order. Default `gemini-2.5-flash,gemini-2.5-flash-lite`, because Google's free tier includes Search grounding only for those (500 requests/day, shared). |
| `COMPASS_PROVIDER` | No | `gemini` or `anthropic`, to force one when both keys are set (default: Anthropic, then Gemini). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | For durable storage on serverless | Generated guides persist across deploys. Otherwise they go to `.data/guides` (local) or `/tmp` (Vercel, temporary, and the UI says so). |
| `COMPASS_DATA_DIR` | No | Custom directory for file storage. |
| `COMPASS_RATE_LIMIT`, `COMPASS_MAX_CONCURRENT` | No | Per-instance limits (default 6 generations per IP per 10 minutes, 3 concurrent). |
| `COMPASS_AGENT_MODE=fixture` | Tests only | Replays a scripted, clearly labelled fixture instead of calling the model. Never set it in production. |

## Checks

```bash
npm run lint            # ESLint
npm run typecheck       # tsc --noEmit
npm test                # 88 unit/integration tests (Vitest)
npm run build           # production build
npm run e2e             # 16 Playwright journeys against the production build (desktop + mobile)
npm run check:secrets   # builds with a canary key and proves it never reaches bundles or responses
npm run smoke:live -- "Linear"   # REAL live run: needs a running server with ANTHROPIC_API_KEY
```

`npm run e2e` needs a prior `npm run build` and a Chromium for Playwright (`npx playwright install chromium`).

## How live generation works

1. `POST /api/generate` validates the input (name or public http(s) website), rate-limits it, and streams progress as
   server-sent events.
2. Research runs on the AI provider's **server-side** tools, so this server never fetches user-supplied URLs itself.
   - **Gemini (free):** phase 1 uses Google Search grounding plus URL context to write research notes. The retrieval
     ledger comes from the API's `groundingMetadata` (queries and grounding pages) and `urlContextMetadata` (pages
     actually read), not from the model's text. Google's grounding redirect links are resolved (that one Google host
     only). Phase 2 turns the notes into JSON under a response schema derived from the Zod guide schema, citing only
     numbered retrieved sources.
   - **Claude:** `web_search` and `web_fetch` server tools, then a `submit_guide` tool with the same schema. It can
     instead call `report_ambiguous` (the UI offers candidates) or `report_not_found`.
3. Invalid output is sent back to the model with the validation errors, up to two repairs, then fails cleanly. Nothing
   is saved.
4. **Integrity enforcement** (`src/lib/evidence.ts`) checks every cited URL against the URLs actually returned by search
   or fetch in that run:
   - sources that were never retrieved are dropped;
   - "sourced" claims left without a source become "inference", with a note;
   - an approval wait must be sourced from a *fetched* page, or it becomes "unknown" (estimates and guesses are removed
     and shown in a note);
   - "tested" is impossible for generated guides;
   - an unsourced claim about Composio managed auth becomes "unknown".
   Each correction is listed on the guide page under *Research trace*.
5. The guide is saved and served at `/guides/<slug>` and `/api/guides/<slug>` (JSON). Repeat requests for the same app
   reuse the saved guide.

## Key decisions

- **Separate "your effort" from "their wait".** Developers mainly ask whether this takes an hour or weeks of waiting.
  These are different kinds of claims: effort can be estimated, review time must come from the provider or stay unknown.
- **Evidence is enforced in code, not requested in a prompt.** A prompt asks the model to cite; the validator makes
  sure citations point at pages the agent retrieved, and downgrades anything that doesn't.
- **Agent vs you, per step.** Every step is marked as something an agent can do, something only you can do (sign-in,
  legal identity, payment, submission), or either.
- **Managed vs custom recommender.** A deterministic rule set, based on Composio's own guidance (branding, scopes,
  quota) plus the guide's approval data, answers "should I even bother with my own app yet?" No model is involved.
- **Small curated set, chosen for variety** (instant, self-serve, review-gated, formal verification) rather than breadth.

## Limitations and what has NOT been tested

- **No provider app was actually registered.** No guide claims anything as "tested". Curated claims are checked against
  provider documentation only (see `docs/evidence-validation.md`).
- **Live generation status is recorded in `docs/evidence-validation.md` → "Live runs".** Until a run is recorded
  there, treat live generation as untested against the real APIs. Both agents are tested with scripted fakes shaped like
  the real API responses (search, fetch, failed fetch, malformed output, quota and auth errors).
- Gemini free tier: Google may use free-tier prompts to improve its products (inputs here are public docs and app names
  only), and quotas are small. When the quota runs out, the app says so and the curated library keeps working.
- Composio managed-auth availability per app is **unknown** in every curated guide. Composio's public docs don't list it;
  the docs say to check `composio_managed_auth_schemes` via the API, which needs an account.
- The rate limiter is in-memory, per server instance.
- Without Upstash, generated guides on Vercel are temporary. The UI warns about this.
- Vercel function duration: generation can take 1–3 minutes. `maxDuration = 300` is set; your plan must allow it.
- Guides go stale when providers change policy. Each curated guide shows its check date.

## Deploying (Vercel)

1. Push this repo to GitHub.
2. Import it in Vercel. Set `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`), and optionally the Upstash variables.
3. Deploy, then run `COMPASS_URL=https://<your-app>.vercel.app npm run smoke:live -- "Linear"`.
