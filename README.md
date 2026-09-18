# XVfinance

AI platform for investment managers (split-screen chat + workspace).

## CRITICAL constraints

- **GitHub:** only this repository — https://github.com/fabian20xv/XVfinance
- **Supabase:** only https://krcwpupbdizzjyydzaqp.supabase.co (project ref `krcwpupbdizzjyydzaqp`). Never create, link, migrate, or seed any other Supabase project.

Stack target: Supabase + Node.js. Chat tools run as user JWT (RLS); service-role must never reach the model or client.

## Locked Supabase project (CA-0.1)

This repo may talk to **one** Supabase project. That lock is duplicated in docs, env example, source constants, startup, and CI so a mispointed URL fails immediately:

| Location | What is locked |
| --- | --- |
| This README | URL + ref below |
| `.env.example` | `SUPABASE_URL=https://krcwpupbdizzjyydzaqp.supabase.co` |
| `src/config/supabase-lock.js` | `ALLOWED_SUPABASE_PROJECT_REF` / `ALLOWED_SUPABASE_URL` |
| `src/index.js` (startup) | Calls `boot()` which asserts host/ref or exits non-zero |
| `npm run assert:supabase` + `.github/workflows/guardrails.yml` | Asserts `.env.example`, source constants, README, and `SUPABASE_URL` when set |

- **URL:** https://krcwpupbdizzjyydzaqp.supabase.co
- **Project ref:** `krcwpupbdizzjyydzaqp`

Any other host, origin, or ref (including other `*.supabase.co` projects) is refused.

## Service-role isolation (CA-0.2)

The service-role key is a server secret. It must never reach the model, the chat tool runner, or a client bundle.

| Code path | Service-role allowed? |
| --- | --- |
| `src/server/` (e.g. `service-role.js`) | Yes — only locked-down server modules |
| `src/chat/` (tool runner + user-JWT client) | No — user JWT + anon/publishable key; env is stripped |
| `src/client/` | No — public URL + anon/publishable key only |

`createChatToolRunner` builds a frozen env **without** service-role secrets and requires a user JWT so RLS applies. ESLint rule `xvfinance/no-service-role-in-chat` (chat + client files) and `test/service-role-isolation.test.js` fail if those trees read the key or import `src/server`.

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
| CA-2.1 | `verifySupabaseAccessToken` checks issuer `https://krcwpupbdizzjyydzaqp.supabase.co/auth/v1`; `attachFirmContext` loads `user_id`, `firm_id`, `role` (`manager`\|`analyst`). Missing / wrong-project / service-role tokens fail loud |
| CA-2.2 | `POST /v1/tools` allowlist + JSON Schema; user JWT client; responses `{ ok, data\|error, audit_id? }` |
| CA-2.3 | `writeAuditEvent` inserts firm-scoped `audit_events` (service-role, server-only) for sensitive reads and proposal lifecycle action names |

```bash
npm start   # node src/index.js --serve  (requires SUPABASE_URL)
# GET  /health          — no JWT
# GET  /v1/session      — Authorization: Bearer <user jwt>
# POST /v1/tools        — { "name": "get_session", "args": {} }
# GET  /v1/proposals
# GET  /v1/proposals/:id
# GET  /v1/proposals/:id/confirm-card
# GET  /v1/proposals/:id/workspace-panel
# POST /v1/proposals/:id/confirm
# POST /v1/proposals/:id/reject
# GET  /v1/reports/:id/export
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
| CA-4.2 | `confirm_proposal` / `reject_proposal` with `requires_role` (`any_member` \| `manager`); apply as confirmer |
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

E9 Meeting Ghostwriter is **out of scope** for this revision.

## Setup

```bash
cp .env.example .env   # placeholders only; never commit real keys
npm install
npm run ci             # lock assert + lint + tests (E0–E8)
# Server-only, locked project only (requires real SUPABASE_SERVICE_ROLE_KEY):
npm run seed
npm run smoke:e1
npm run smoke:e5e8
```

Start (requires `SUPABASE_URL` in the environment):

```bash
node --env-file=.env src/index.js
```
