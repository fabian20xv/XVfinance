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
| `src/client/` | No — public URL + anon/publishable key only |

`createChatToolRunner` builds a frozen env **without** service-role secrets and requires a user JWT so RLS applies. ESLint rule `xvfinance/no-service-role-in-chat` (chat + client files) and `test/service-role-isolation.test.js` fail if those trees read the key or import `src/server`. The service-role key lives only in `src/server/service-role.js`. Tess smoke uses the user-JWT client so RLS applies.

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
| How it starts | `npm start` → `node src/index.js --serve` | Vercel invokes the Function at `api/index.js` (and `api/[...path].js` so `/api/health` is not a missing-file 404) |
| Process | Long-lived `node:http` server, `PORT` default `8787` | One serverless invocation per request (Fluid Compute). No `node src/index.js --serve` |
| Routing | `req.url` is the public path | `vercel.json` sends `/api/health`, `/api/smoke`, `/health`, and `/v1/*` to that Function. Non-`/api` paths are rewritten with `xv_path` so the listener still matches `/health` and `/v1/*` |
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

Migrations live in `supabase/migrations/` and may be applied **only** to https://krcwpupbdizzjyydzaqp.supabase.co. Do not `supabase link`, migrate, or seed any other project.

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
| CA-4.2 | `confirm_proposal` / `reject_proposal` with `requires_role` (`any_member` \| `manager`); apply as confirmer. Lifecycle `audit_events` (`proposal.applied` / `proposal.rejected` / …) are inserted in the same transaction as the status/apply; audit insert failure rolls back the mutate. |
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

## Setup

```bash
cp .env.example .env   # placeholders only; never commit real keys
npm install
npm run ci             # lock assert + lint + tests (E0–E9)
# Server-only, locked project only (requires real SUPABASE_SERVICE_ROLE_KEY):
npm run seed                    # parent/prod smoke fixture only
npm run seed:tess -- --dry-run  # develop URL guard; no writes
# npm run seed:tess             # develop Tess QA fixtures; refuses parent
npm run smoke:e1
npm run smoke:e5e8
npm run smoke:e9
```

Start (requires `SUPABASE_URL` in the environment). Without `--serve` the process only runs `boot()` and exits. `npm start` adds `--serve`:

```bash
node --env-file=.env src/index.js --serve
# or: npm start
```
