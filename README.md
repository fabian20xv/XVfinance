# XVfinance

AI platform for investment managers (split-screen chat + workspace).

## CRITICAL constraints

- **GitHub:** only this repository — https://github.com/fabian20xv/XVfinance
- **Supabase:** only these two projects. Never create, link, migrate, or seed any other Supabase project.
  1. **Parent/prod:** https://krcwpupbdizzjyydzaqp.supabase.co (project ref `krcwpupbdizzjyydzaqp`)
  2. **Develop/staging:** https://bkwhqfkosxnoffpsjcug.supabase.co (project ref `bkwhqfkosxnoffpsjcug`) — **staging-only** (Tess). Do not use this ref when `APP_ENV` / `VERCEL_ENV` is `production`.

Stack target: Supabase + Node.js. Chat tools run as user JWT (RLS); service-role must never reach the model or client.

## Locked Supabase projects (CA-0.1)

This repo may talk to **two** Supabase projects (parent/prod and develop/staging). That lock is duplicated in docs, env example, source constants, startup, and CI so a mispointed URL fails immediately:

| Location | What is locked |
| --- | --- |
| This README | Both URLs + refs below |
| `.env.example` | Parent default `SUPABASE_URL`; develop URL documented as staging-only |
| `src/config/supabase-lock.js` | `ALLOWED_SUPABASE_PROJECT_REFS` / `ALLOWED_SUPABASE_URLS` |
| `src/index.js` (startup) | Calls `boot()` which asserts host/ref or exits non-zero |
| `npm run assert:supabase` + `.github/workflows/guardrails.yml` | Asserts `.env.example`, source constants, README, and `SUPABASE_URL` when set |

- **Parent/prod URL:** https://krcwpupbdizzjyydzaqp.supabase.co — ref `krcwpupbdizzjyydzaqp`
- **Develop/staging URL:** https://bkwhqfkosxnoffpsjcug.supabase.co — ref `bkwhqfkosxnoffpsjcug` (staging-only)

Any other host, origin, or ref (including other `*.supabase.co` projects) is refused. A third ref fails with the same loud `Refused Supabase project ref` error as a missing URL. Schema migrations and `npm run seed` stay pinned to the parent/prod project. Tess QA fixtures are an additive develop-only path (`npm run seed:tess`) and **refuse** parent ref `krcwpupbdizzjyydzaqp`.

## Service-role isolation (CA-0.2)

The service-role key is a server secret. It must never reach the model, the chat tool runner, or a client bundle.

| Code path | Service-role allowed? |
| --- | --- |
| `src/server/` (e.g. `service-role.js`) | Yes — only locked-down server modules |
| `src/chat/` (tool runner + user-JWT client) | No — user JWT + anon/publishable key; env is stripped |
| `src/ai/` (prompts, OpenAI turn loop, tool adapters) | No — same as chat; tools run through `tool-router` |
| `src/client/` | No — public URL + anon/publishable key only |

`createChatToolRunner` builds a frozen env **without** service-role secrets and requires a user JWT so RLS applies. ESLint rule `xvfinance/no-service-role-in-chat` (chat + ai + client files) and `test/service-role-isolation.test.js` fail if those trees read the key or import `src/server`. The service-role key lives only in `src/server/service-role.js`. Tess smoke uses the user-JWT client so RLS applies.

## Tess health / smoke (E0 HTTP API)

`npm start` (`node src/index.js --serve`) boots the allowlist lock and serves the existing E0 Node HTTP API (PORT default `8787`). Health and smoke are extra routes on that same server — not a second listener.

### `GET /api/health`

Unauthenticated liveness. Always `200` after a successful boot:

```json
{ "ok": true, "commit": "<sha or unknown>", "env": "<APP_ENV or VERCEL_ENV or development>", "supabaseRef": "<allowlisted ref>" }
```

- `commit` — `VERCEL_GIT_COMMIT_SHA`, else `GIT_COMMIT`, else `unknown`
- `env` — `APP_ENV`, else `VERCEL_ENV`, else `development`
- `supabaseRef` — the locked project ref from `SUPABASE_URL` (runtime lock; parent or develop)

`POST /v1/tools` `{ "name": "health" }` uses the **same** `SUPABASE_URL` lock. It must not echo parent ref `krcwpupbdizzjyydzaqp` when Preview/staging is locked to develop.

### `POST /api/smoke`

Staging-only probe. **Refused when `APP_ENV` or `VERCEL_ENV` is `production`** (`403`). Requires header `x-smoke-secret` matching env `SMOKE_SECRET` (`401` if missing/wrong/unset). Never logs the secret, user JWT, or service-role key.

Steps (each returns `ok`, `ms`, and skip/error detail):

1. **boot** — re-run the allowlist lock
2. **auth** — if `SMOKE_USER_JWT` is set, create a user-JWT client (RLS) and call `auth.getUser`; otherwise `{ skipped: true, reason: "SMOKE_USER_JWT not set" }`
3. **db** — if `SMOKE_DB_TABLE` is set, `select` (`SMOKE_DB_SELECT`, default `id`) `limit 1` via that user-JWT client; otherwise skip with a clear reason (`SMOKE_DB_TABLE not set`, or no JWT)

Overall `200` when every step is ok (skipped counts as ok); `503` if a step fails.

### Vercel Preview vs local `--serve`

Same listener (`createRequestListener` in `src/server/http.js`). Different process wrappers:

| | Local | Vercel Preview / Production |
| --- | --- | --- |
| How it starts | `npm start` → `node src/index.js --serve` | Next.js App Router (`app/`) plus the same listener via `app/api/*`, `app/v1/*`, and `api/index.js` |
| Process | Long-lived `node:http` server, `PORT` default `8787` | One serverless invocation per request (Fluid Compute). No `node src/index.js --serve` |
| Routing | `req.url` is the public path | `vercel.json` sends `/api/health`, `/api/smoke`, `/health`, and `/v1/*` to the same listener (`xv_path` for `/health` and `/v1/*`). `/` is the E10 Dana shell — there is no catch-all rewrite |
| Allowlist | `boot()` on process start | `boot()` on Function init (same `SUPABASE_URL` allowlist; develop ref refused when `VERCEL_ENV`/`APP_ENV` is production) |

Do not run `--serve` on Vercel. Preview/staging `SUPABASE_URL` must be develop only (`bkwhqfkosxnoffpsjcug`). Never parent `krcwpupbdizzjyydzaqp` on Preview.

## Tess develop seed (QA fixtures)

Additive Maestro/Tess path. App runtime on parent is unchanged: `boot()` still allows `krcwpupbdizzjyydzaqp`, and `npm run seed` still calls parent `run_dev_seed`.

| Command | Target | Writes Tess fixtures? |
| --- | --- | --- |
| `npm run seed` | Parent/prod only | No (product smoke firm) |
| `npm run seed:tess` | **Develop only** `bkwhqfkosxnoffpsjcug` | Yes |
| `npm run seed:tess -- --dry-run` | Asserts develop URL; no writes | No |

`scripts/seed-tess-develop.js` asserts `SUPABASE_URL` is exactly https://bkwhqfkosxnoffpsjcug.supabase.co and **fails loud** if it is parent https://krcwpupbdizzjyydzaqp.supabase.co (or any other ref). Never seed Tess/QA data into the parent project. Service-role is used only inside `src/server/tess-seed.js` (never chat tools).

Preview/staging uses develop **only** (`SUPABASE_URL=https://bkwhqfkosxnoffpsjcug.supabase.co`, `APP_ENV=staging`, develop `SUPABASE_ANON_KEY`, `SMOKE_SECRET` shared with Tess, develop server-only `SUPABASE_SERVICE_ROLE_KEY`, develop `SUPABASE_JWT_SECRET` if JWT verify is used). Never parent `krcwpupbdizzjyydzaqp` on Preview.

Exact migrate + `seed:tess` steps, env table, inventory, and logins: [`docs/tess-develop-seed.md`](docs/tess-develop-seed.md).

If develop is behind main, **schema migrations must be applied to develop** before seed. This seed reuses existing `firms` / `firm_members` / domain tables; it does not add a product schema.

## Schema + RLS (E1)

E1–E9 schema migrations live in `supabase/migrations/` and stay pinned to https://krcwpupbdizzjyydzaqp.supabase.co. Exception: `20260920210000_proposal_lifecycle_audit.sql` may also be applied to develop https://bkwhqfkosxnoffpsjcug.supabase.co (Tess Preview). Refuse any third project. Do not `supabase link` or seed a non-allowlisted project.

| Ticket | What shipped |
| --- | --- |
| CA-1.1 | `firms`, `firm_members` with roles `manager` \| `analyst` |
| CA-1.2 | `clients`, `contacts`, `portfolios`, `instruments`, `holdings`, `notes`, `reports`, `proposals`, `audit_events` — all with `firm_id` |
| CA-1.5 | `portfolios.cash_balance`, `cash_currency`, `liquidity_available`, `liquidity_buffer` |
| CA-1.3 | RLS enabled; firm-scoped select (all members read all firm clients); high-PII / holdings / notes have **no** direct `authenticated` writes (proposal apply / service-role only); proposal confirm is manager-gated when `requires_manager` |
| CA-1.4 | `npm run seed` / `npm run smoke:e1` use the service-role key on the locked URL only and **fail loud** otherwise |

Membership helpers are `security definer` functions in the unexposed `private` schema (`private.is_firm_member`, `private.is_firm_manager`).

## Auth session → Node API (E2)

The API verifies **user** JWTs issued by the locked project, attaches `firm_members` context, and runs chat tools with a user-scoped Supabase client (RLS). Service-role tokens are refused.

| Ticket | What shipped |
| --- | --- |
| CA-2.1 | `verifySupabaseAccessToken` accepts user JWTs from the parent or develop issuer. HS256 uses `SUPABASE_JWT_SECRET`; ES256/RS256 (develop JWKS) uses `createRemoteJWKSet` at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Jose key-type/alg mismatches fall through to Auth `GET /auth/v1/user`. `attachFirmContext` loads `user_id`, `firm_id`, `role` (`manager`\|`analyst`). Missing / wrong-project / service-role tokens fail loud |
| CA-2.2 | `POST /v1/tools` allowlist + JSON Schema; user JWT client; responses `{ ok, data\|error, audit_id? }` |
| CA-2.3 | `writeAuditEvent` inserts firm-scoped `audit_events` (service-role, server-only) for sensitive reads and proposal lifecycle action names. Confirm/reject lifecycle rows are also written in the same DB transaction as apply (fail-closed). If the HTTP writer fails after a committed confirm/reject, the API still returns **200** with the applied/rejected result — never 500. `POST /v1/tools` `health` reports the **runtime** locked ref from `SUPABASE_URL` (same source as `GET /api/health`), not the parent constant. |

```bash
npm start   # node src/index.js --serve  (requires SUPABASE_URL; PORT default 8787)
# Vercel Preview invokes api/index.js (same createRequestListener; see vercel.json)
# GET  /api/health      — Tess liveness { ok, commit, env, supabaseRef }; no JWT
# POST /api/smoke       — Tess staging probe; header x-smoke-secret; 403 in production
# GET  /health          — no JWT
# GET  /v1/session      — Authorization: Bearer <user jwt>
# POST /v1/tools        — { "name": "get_session"|"health", "args": {} }
# POST /v1/ai/chat      — { "messages": [{ "role": "user", "content": "..." }] }  (SSE or JSON; OpenAI + allowlisted tools)
# GET  /v1/proposals
# GET  /v1/proposals/:id
# GET  /v1/proposals/:id/confirm-card
# GET  /v1/proposals/:id/workspace-panel
# POST /v1/proposals/:id/confirm
# POST /v1/proposals/:id/reject
# GET  /v1/reports/:id/export
# GET  /v1/reports/:id/receipts
# GET  /v1/reports/:id/meeting-export
# POST /v1/imports/holdings
# GET  /v1/scratchpads/:id/impact
```

## Read tools + workspace focus (E3)

Chat tools run through the E2 allowlist router with a **user-JWT** Supabase client (RLS). Sensitive reads emit `audit_events` via the server writer (service-role never reaches the tool).

| Ticket | What shipped |
| --- | --- |
| CA-3.1 | `get_session_context`, `set_workspace_focus` (`workspace_focus` table, self write) |
| CA-3.2 | Paginated `list`/`get` for clients, portfolios, holdings — list items use minimized `{ id, label, … }` |
| CA-3.5 | `get_portfolio` / `list_portfolios` include `cash_balance`, `cash_currency`, `liquidity_available`, `liquidity_buffer` |
| CA-3.3 | `get_contact`, `list_notes` (excerpts), `get_note` — audited |
| CA-3.4 | `watchlists` + `watchlist_items` (firm-scoped reads; mutations via proposals) |

## Proposal pipeline + dual confirm (E4)

Mutations to clients/contacts/holdings/notes/watchlists stay blocked for `authenticated`. Members insert `pending_confirm` proposals; confirm/reject is role-gated. A `BEFORE UPDATE` trigger on `proposals` applies the payload **in the same transaction as the confirming user** (`auth.uid()`), writing domain rows from a `private` security-definer function.

| Ticket | What shipped |
| --- | --- |
| CA-4.1 | Proposals API: `pending` / `confirmed` / `rejected` / `expired` (+ `preview`, `expires_at`, `idempotency_key`) |
| CA-4.2 | `confirm_proposal` / `reject_proposal` with `requires_role` (`any_member` \| `manager`); apply as confirmer. Lifecycle `audit_events` (`proposal.applied` / `proposal.rejected` / …) are inserted in the same transaction as the status/apply; audit insert failure rolls back the mutate. `20260920210000_proposal_lifecycle_audit.sql` may be applied to **both** E0 refs (develop `bkwhqfkosxnoffpsjcug` for Preview/Tess, parent `krcwpupbdizzjyydzaqp` for prod). Refuse any third project. |
| CA-4.3 | Chat confirm card contract `ui: chat.confirm_card` |
| CA-4.4 | Workspace diff/confirm panel `ui: workspace.diff_confirm_panel` — **same `proposal_id`** |
| CA-4.5 | `propose_holding_changes`, `propose_client_upsert`, `propose_contact_upsert` |
| CA-4.6 | `propose_watchlist_upsert` |
| Notes | `propose_note_upsert` confirm default **`any_member`** (analyst or manager) — not manager-only |

## Notes + draft reports (E5)

Draft report writes are direct (authenticated + RLS). Publish is a manager proposal. Exports are audited JSON snapshots with `public_url: null` — no anonymous public URL.

| Ticket | What shipped |
| --- | --- |
| CA-5.1 | `propose_note_create` / `propose_note_update` (and existing upsert). Confirm default **`any_member`** |
| CA-5.2 | `create_report_draft`, `update_report_section` — no proposal |
| CA-5.3 | `propose_report_publish` (manager confirm) + `export_published_report` (audited; `public_url` always null) |

## CSV holdings import (E6)

Uploads land in private Storage bucket `firm-imports` on **this project only**, path `{firm_id}/{user_id}/{filename}`. Unmatched symbols block confirm; manager apply upserts matched rows only (no auto-created instruments).

| Ticket | What shipped |
| --- | --- |
| CA-6.1 | Parse CSV (`symbol`, `quantity`, optional `cost_basis` / `as_of`); store under the firm prefix |
| CA-6.2 | `import_holdings_csv` → `holdings_import` proposal; unmatched blocks confirm; manager apply |

## Market read tools (E7)

Provider adapter in `src/market/provider.js`. If `MARKET_API_KEY` is missing or a placeholder, tools use `StubMarketProvider` (equities-first canned universe). Live HTTP requires `MARKET_API_KEY` + `MARKET_API_BASE`.

| Ticket | What shipped |
| --- | --- |
| CA-7.1 | `MarketProvider` interface: quote / fundamentals / news / search |
| CA-7.2 | `get_quote`, `get_fundamentals`, `get_news_headlines`, `search_instruments` on the E2 allowlist |

## Impact Scratchpad (E8)

Scratchpads are watermarked **not live / not source of truth**. Impact vs live holdings is read-only. Promote opens a manager proposal; holdings are not mutated until confirm.

| Ticket | What shipped |
| --- | --- |
| CA-8.1 | UI contract `workspace.impact_scratchpad` + watermark payload |
| CA-8.2 | `get_scratchpad_impact` (read-only vs live holdings) |
| CA-8.3 | `promote_scratchpad` → `scratchpad_promote` proposal (manager confirm) |

## Meeting Ghostwriter + Receipts (E9)

Ghostwrite writes a **draft** meeting 1-pager (via `reports` with `purpose = meeting_one_pager`) that cites firm-scoped receipts. Client-facing email/export requires a manager `meeting_send` proposal. No anonymous public URL.

| Ticket | What shipped |
| --- | --- |
| CA-9.1 | `ghostwrite_meeting_one_pager` drafts a 1-pager citing notes, holdings snapshots, proposals, and reports |
| CA-9.2 | Receipts panel `ui: workspace.receipts_panel` (`get_meeting_receipts`); each receipt is firm-scoped and auditable |
| CA-9.3 | `propose_meeting_send` (manager confirm, channel `email` \| `export`) + `export_meeting_one_pager` (audited; `public_url` always null) |

## Split-screen shell (E10, Dana v1.2)

Next.js App Router UI at `app/` (same repo as the Node `/v1` server). Design pack v1.2 (Rio sharpen) is copy/motion on the v1.1 inventory: Inter + system-ui, accent `#0F6E6A`, 56/44 split (drag 48–64, reset → 56), 48px top bar, no nav rail, 8px grid, 10px radius. Composer stays unlocked while confirm is pending.

| Surface | Wiring |
| --- | --- |
| AuthGate | Supabase Auth session only; user JWT is sent as `Authorization: Bearer` to `/v1` |
| Confirm pulse | ConfirmCard + DiffConfirmPanel share `proposal_id`. Select/focus (never hover) inhales both borders once (600ms ease-out). Primary **Confirm change**; secondary **Dismiss proposal**. Success: **Confirmed · {time} · you**, then fade ~1.2s. `POST /v1/proposals/:id/confirm` / `reject` |
| Scratchpad | Veil over the right pane only (not a tab). Diagonal **DRAFT · what-if** at 8–12%. Subline: **Won’t change positions until you confirm.** `GET /v1/scratchpads/:id/impact`. Promote → `scratchpad_promote` manager dual-confirm. ConfirmCard is absent while the veil is open. Success dissolves upward; fail keeps the watermark and toasts **Not applied — still draft.** Discard dissolves in 200ms with no source-of-truth persist |
| Receipts | Marks **[1]** (not “citation”). Side-slip popover beside the mark (120–160ms fade + 2px rise). Title is source type + relative time; one factual body line; **Open in workspace** only when `path` is present. Missing/RLS → dashed **[?]** **Not available for this account**. `public_url` is always `null`. Email/Export → `propose_meeting_send` |
| Composer | Stays unlocked while confirm is pending. RFC-011: composer wires **only** to `POST /v1/ai/chat`. Confirm/reject proposals unchanged. |
| SpeakReadyToggle | Deferred to epic 1.5 (file kept, not mounted) |

Out of scope: CRM, optimizer, news firehose, scenario libraries, dark mode.

Preview/dev web env may use develop ref `bkwhqfkosxnoffpsjcug`. Production must use parent `krcwpupbdizzjyydzaqp`.

## Agent chat runtime (E11, RFC-011)

Left-pane natural language runs an OpenAI-primary tool loop over the existing E2 allowlist. Writes still stop at a pending proposal — ConfirmCard / DiffConfirmPanel apply them.

Layout (mirrors `src/ai/{prompts,runtime,tools}`):

| Path | Role |
| --- | --- |
| `src/ai/prompts/` | PM brief, confirm-on-write rules, top-10 Portfolio Manager jobs. Impact Scratchpad + Meeting Ghostwriter/Receipts called out as differentiators. |
| `src/ai/runtime/` | OpenAI Chat Completions turn loop: messages in → model with tools → execute allowlisted tools (user JWT + RLS) → stream/accumulate assistant reply. Timeouts and spend-safe defaults (`gpt-4o-mini`, capped rounds/tokens). |
| `src/ai/tools/` | Thin adapters: OpenAI function definitions from `src/chat` JSON Schema. Handlers stay in `tool-router`. `confirm_proposal` / `reject_proposal` are **not** model-callable. |

`src/ai/` is on the same service-role ban as `src/chat/` (ESLint + source scan). The HTTP listener (`POST /v1/ai/chat`, RFC-011) authenticates like `POST /v1/tools` (bearer **user** JWT). Tool execution never sees `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY`. The E10 composer does not call `/v1/tools` or `/v1/chat`.

**Required env:** `OPENAI_API_KEY` on Preview and Production. If it is missing or a placeholder, the endpoint returns `503` `{ "error": { "code": "openai_api_key_missing" } }` — it does not invent a successful reply. Optional: `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_BASE_URL`.

### Try one chat turn on Preview (develop Supabase + OpenAI)

1. Vercel Preview env: `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` = develop `https://bkwhqfkosxnoffpsjcug.supabase.co` (never parent on Preview), matching develop anon key, **and** `OPENAI_API_KEY`.
2. Sign in as a Tess develop user (see [`docs/tess-develop-seed.md`](docs/tess-develop-seed.md)).
3. In the left composer, type a natural-language turn (not a `/tool` slash), e.g. `What's in session context?` or `How concentrated is this book?`.
4. Confirm the network call is `POST /v1/ai/chat` with `Authorization: Bearer <user jwt>`. The composer does not call `/v1/tools` or `/v1/chat`.
5. If the agent proposes a write, Confirm change / Dismiss proposal still go to `POST /v1/proposals/:id/confirm` and `/reject` — not the model.

Local JSON (no stream) against `npm start`:

```bash
curl -sS http://127.0.0.1:8787/v1/ai/chat \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"stream":false,"messages":[{"role":"user","content":"What is my session?"}]}'
```

## Setup

```bash
cp .env.example .env   # placeholders only; never commit real keys
npm install
npm run ci             # lock assert + lint + tests (E0–E11)
# Server-only, locked project only (requires real SUPABASE_SERVICE_ROLE_KEY):
npm run seed                    # parent/prod smoke fixture only
npm run seed:tess -- --dry-run  # develop URL guard; no writes
# npm run seed:tess             # develop Tess QA fixtures; refuses parent
npm run smoke:e1
npm run smoke:e5e8
npm run smoke:e9
```

Start the Node `/v1` API (requires `SUPABASE_URL` in the environment). Without `--serve` the process only runs `boot()` and exits. `npm start` adds `--serve`:

```bash
node --env-file=.env src/index.js --serve
# or: npm start
```

The API still listens on `PORT` (default `8787`). It is unchanged for E0–E10 routes; E11 adds `POST /v1/ai/chat` (health, smoke, `/v1/session`, `/v1/tools`, proposals, scratchpad impact, meeting receipts).

Start the E10 web shell (App Router). Next.js also serves `/v1`, `/health`, `/api/health`, and `/api/smoke` through the same `createRequestListener`, so `npm run web` is enough for local UI + API. Keep `npm start` when you want the Node listener alone:

```bash
# Web + API in one Next.js process (http://127.0.0.1:3000)
npm run web

# Optional: Node API only (http://127.0.0.1:8787)
npm start
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same allowlisted projects as `SUPABASE_URL`). AuthGate signs in with Supabase Auth, then calls `GET /v1/session` with the user JWT.
