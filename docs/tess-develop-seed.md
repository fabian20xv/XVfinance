# Tess develop seed (QA fixtures)

Additive Tess/Maestro path. It does **not** change E0 app-runtime locks: `boot()` and `npm run seed` still treat parent/prod as the product project.

## CRITICAL project split

| Role | URL | Ref | Tess seed |
| --- | --- | --- | --- |
| **Develop (Tess QA ONLY)** | https://bkwhqfkosxnoffpsjcug.supabase.co | `bkwhqfkosxnoffpsjcug` | Allowed — this is the only target |
| **Parent / product** | https://krcwpupbdizzjyydzaqp.supabase.co | `krcwpupbdizzjyydzaqp` | **Forbidden** — `seed:tess` fails loud |

Never write Tess/QA fixtures into the parent project. `npm run seed` (parent smoke fixture) is a different command and stays pinned to parent.

## Preview / staging env (develop ONLY)

Vercel Preview and Tess staging use the **develop** project only. Never set parent `krcwpupbdizzjyydzaqp` on Preview.

| Var | Preview / staging value |
| --- | --- |
| `SUPABASE_URL` | `https://bkwhqfkosxnoffpsjcug.supabase.co` (ref `bkwhqfkosxnoffpsjcug`) |
| `SUPABASE_ANON_KEY` | develop anon / publishable key |
| `APP_ENV` | `staging` |
| `SMOKE_SECRET` | shared with Tess (`x-smoke-secret` on `POST /api/smoke`) |
| `SUPABASE_SERVICE_ROLE_KEY` | develop service-role, **server-only** — seeds and Node API, never chat tools or clients |
| `SUPABASE_JWT_SECRET` | develop JWT secret **if** the HS256 verify path is used |

```bash
SUPABASE_URL=https://bkwhqfkosxnoffpsjcug.supabase.co
SUPABASE_ANON_KEY=<develop anon>
APP_ENV=staging
SMOKE_SECRET=<shared with Tess>
SUPABASE_SERVICE_ROLE_KEY=<develop, server-only>
# If JWT verify path is used:
SUPABASE_JWT_SECRET=<develop>
```

`APP_ENV` / `VERCEL_ENV` must **not** be `production` (develop ref is refused in production; Tess smoke is `403`).

## Required env vars for `seed:tess`

Same develop URL and **develop** service-role as Preview. Copy `.env.example` and point these at develop, not parent:

```bash
# Must be exactly this URL. Parent is refused.
SUPABASE_URL=https://bkwhqfkosxnoffpsjcug.supabase.co
APP_ENV=staging

# Server-only. Used by scripts/seed-tess-develop.js and the Node API. Never expose to chat tools, the model, or clients.
SUPABASE_SERVICE_ROLE_KEY=<develop, server-only>

# Develop anon / publishable key (user-JWT RLS after seed; Tess Preview clients).
SUPABASE_ANON_KEY=<develop anon>

# Shared with Tess for POST /api/smoke (Preview/staging only).
SMOKE_SECRET=<shared with Tess>

# If the API verifies user JWTs with HS256 (optional if Auth /user check is used).
SUPABASE_JWT_SECRET=<develop>

# Optional. Defaults to the documented Tess QA password in src/db/tess-ids.js
# TESS_QA_PASSWORD=TessQa.Develop.Only.2026!

# Optional dry-run (no writes, no service-role required)
# TESS_SEED_DRY_RUN=1
```

## Commands

```bash
# Guard only (no database writes; safe in CI)
npm run seed:tess -- --dry-run

# Write fixtures (service-role, develop only)
npm run seed:tess
```

Equivalent: `node scripts/seed-tess-develop.js`.

If `SUPABASE_URL` is missing, a third project, or parent `krcwpupbdizzjyydzaqp`, the process exits non-zero with `XVfinance Tess develop seed aborted: …`.

## Schema must exist on develop first

This seed **reuses** the E1–E9 schema already in `supabase/migrations/` (`firms`, `firm_members`, clients, portfolios, holdings, notes, watchlists, proposals, reports, `audit_events`, …). It does not add product tables.

If develop is behind main, **schema migrations must be applied to develop** (`bkwhqfkosxnoffpsjcug`) before `seed:tess`. The seed fails with `Develop schema is behind main` when `firms` / `reports` / `audit_events` are missing.

Do **not** run `npm run seed` (parent `run_dev_seed`) against develop, and do **not** run `npm run seed:tess` against parent.

## Fixture inventory

Idempotent upserts on well-known UUIDs in `src/db/tess-ids.js`.

### Tenants (firms)

| Firm | Name | Members |
| --- | --- | --- |
| Alpha | Tess Alpha Wealth (develop QA) | manager (privileged writer) + analyst (restricted writer) |
| Beta | Tess Beta Advisors (develop QA) | manager + analyst (second tenant / isolation) |

All users are **firm members**, not platform admins (`app_metadata.xvfinance_platform_admin = false`). Auth role is `authenticated`.

### Users (login)

Default password: `TessQa.Develop.Only.2026!` (QA fixture only; override with `TESS_QA_PASSWORD`).

| Email | Firm | Role | Writer |
| --- | --- | --- | --- |
| tess.alpha.manager@xvfinance.invalid | Alpha | manager | privileged |
| tess.alpha.analyst@xvfinance.invalid | Alpha | analyst | restricted |
| tess.beta.manager@xvfinance.invalid | Beta | manager | privileged |
| tess.beta.analyst@xvfinance.invalid | Beta | analyst | restricted |

### Domain rows (top-10 IM jobs)

Enough rows for Tess acceptance of the top investment-manager jobs:

1. **Clients** — Alpha family office + endowment; Beta household (`list_clients` / `get_client`)
2. **Contacts** — primary contact per client (`get_contact`)
3. **Portfolios + cash/liquidity** — `cash_balance`, `cash_currency`, `liquidity_available`, `liquidity_buffer` (`list_portfolios` / `get_portfolio`)
4. **Holdings** — SPY/AAPL on Alpha; SPY on Beta (`list_holdings` / `get_holding`)
5. **Notes** — IPS / spending / cash-need notes (`list_notes` / `get_note`)
6. **Watchlists** — firm watchlists + SPY items
7. **Pending proposal** — Alpha `holding_changes` `pending_confirm`, manager-gated
8. **Draft report** — Alpha quarterly draft (`status = draft`)
9. **Audit events** — firm-scoped rows selectable under RLS by those members (`audit_events_select_firm`)
10. **Session / workspace focus** — manager + analyst focus rows (`get_session` / `get_session_context`)

Also seeds a watermarked scratchpad on Alpha (E8).

## Service-role isolation

The service-role key is read only inside `src/server/service-role.js` via `src/server/tess-seed.js`. Chat tools and client bundles must not import this module (existing ESLint + isolation tests).
