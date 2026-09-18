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
| CA-2.2 | `POST /v1/tools` allowlist + JSON Schema; user JWT client; responses `{ ok, data\|error, audit_id? }`. Stub tools: `get_session`, `health` |
| CA-2.3 | `writeAuditEvent` inserts firm-scoped `audit_events` (service-role, server-only) for sensitive reads and proposal lifecycle action names |

```bash
npm start   # node src/index.js --serve  (requires SUPABASE_URL)
# GET  /health          — no JWT
# GET  /v1/session      — Authorization: Bearer <user jwt>
# POST /v1/tools        — { "name": "get_session", "args": {} }
```

## Setup

```bash
cp .env.example .env   # placeholders only; never commit real keys
npm install
npm run ci             # lock assert + lint + tests (E0 + E1 + E2)
# Server-only, locked project only (requires real SUPABASE_SERVICE_ROLE_KEY):
npm run seed
npm run smoke:e1
```

Start (requires `SUPABASE_URL` in the environment):

```bash
node --env-file=.env src/index.js
```
