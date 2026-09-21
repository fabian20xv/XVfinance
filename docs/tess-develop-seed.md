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

## Exact steps: apply schema to develop if behind, then seed

This seed **reuses** the E1–E9 files in `supabase/migrations/` (`firms`, `firm_members`, clients, portfolios, holdings, notes, watchlists, proposals, reports, `audit_events`, …). It does not add product tables.

`20260920210000_proposal_lifecycle_audit.sql`, `20260921100000_meeting_send_apply.sql`, and `20260921140000_analyst_reject_manager_gated.sql` are **not parent-only**: apply them on develop `bkwhqfkosxnoffpsjcug` (Preview/Tess). Refuse any other Supabase ref. Do **not** apply Tess fixture seeds to parent. Tess A→G needs fail-closed confirm audit, `meeting_send` apply, and analyst dismiss/reject on develop.

If develop is behind main, **schema migrations must be applied to develop** before `seed:tess`. The seed fails with `Develop schema is behind main` when `firms` / `reports` / `audit_events` are missing.

Do **not** run `npm run seed` (parent `run_dev_seed`) against develop. Do **not** run `npm run seed:tess` against parent. Do **not** `supabase link` / `db push` parent `krcwpupbdizzjyydzaqp` for this Tess path.

### A) Apply schema/migrations to develop (only if behind)

From the repo root, on a checkout that has the E1–E9 files under `supabase/migrations/`:

```bash
# 1. Hard-stop: these commands must target develop only.
export DEVELOP_REF=bkwhqfkosxnoffpsjcug
export PARENT_REF=krcwpupbdizzjyydzaqp
test "$DEVELOP_REF" = "bkwhqfkosxnoffpsjcug"
test "$PARENT_REF" != "$DEVELOP_REF"

# 2. Login to the Supabase CLI (once per machine).
npx supabase login

# 3. See which E1–E9 files are missing on develop. Abort if you typed the parent ref.
npx supabase migration list --project-ref "$DEVELOP_REF"
# NEVER: npx supabase migration list --project-ref krcwpupbdizzjyydzaqp

# 4. Print what would be applied (no writes).
npx supabase db push --project-ref "$DEVELOP_REF" --dry-run

# 5. Apply pending files to develop only. You will be prompted for the
#    develop database password (Dashboard → Project Settings → Database).
npx supabase db push --project-ref "$DEVELOP_REF"
```

If the CLI asks you to link a project, use **only** `--project-ref bkwhqfkosxnoffpsjcug`. If `.supabase` / `supabase/.temp/project-ref` would become `krcwpupbdizzjyydzaqp`, stop.

Alternative when you have a develop Postgres URL (must contain `bkwhqfkosxnoffpsjcug`; abort if it contains `krcwpupbdizzjyydzaqp`):

```bash
echo "$DEVELOP_DB_URL" | grep -q bkwhqfkosxnoffpsjcug
echo "$DEVELOP_DB_URL" | grep -q krcwpupbdizzjyydzaqp && { echo "Refused parent DB URL"; exit 1; }
npx supabase migration list --db-url "$DEVELOP_DB_URL"
npx supabase db push --db-url "$DEVELOP_DB_URL" --dry-run
npx supabase db push --db-url "$DEVELOP_DB_URL"
```

Expected local files (apply any that are Local-only on develop):

- `20260918213000_e1_schema_rls.sql`
- `20260918220000_e3_e4_watchlists_proposals.sql`
- `20260918230000_e5_e8_reports_imports_scratchpad.sql`
- `20260918240000_e9_meeting_ghostwriter.sql`
- `20260920210000_proposal_lifecycle_audit.sql`
- `20260921100000_meeting_send_apply.sql`
- `20260921140000_analyst_reject_manager_gated.sql`

### B) Run `npm run seed:tess` (develop URL + develop service-role)

```bash
# Develop keys only. Parent URL/keys are refused / must not be used.
export SUPABASE_URL=https://bkwhqfkosxnoffpsjcug.supabase.co
export SUPABASE_SERVICE_ROLE_KEY='<develop service-role>'
export SUPABASE_ANON_KEY='<develop anon>'
export APP_ENV=staging

# Optional but recommended for Preview/Tess:
# export SMOKE_SECRET='<shared with Tess>'
# export SUPABASE_JWT_SECRET='<develop jwt secret>'

# 1. Dry-run: asserts develop URL, prints inventory, writes nothing.
#    Service-role may be unset for this step.
npm run seed:tess -- --dry-run
```

Expected dry-run (exit 0):

```text
Tess develop seed dry-run OK — would write fixtures to https://bkwhqfkosxnoffpsjcug.supabase.co (ref bkwhqfkosxnoffpsjcug). Parent is forbidden.
Inventory: 2 tenants, 4 firm members, 10 top jobs.
```

```bash
# 2. Write fixtures (service-role required; still fails if URL is parent).
npm run seed:tess
```

Expected live seed (exit 0):

```text
Tess develop seed OK — firms b0000000-0000-4000-8000-000000000001, b0000000-0000-4000-8000-000000000002 on https://bkwhqfkosxnoffpsjcug.supabase.co (ref bkwhqfkosxnoffpsjcug)
```

Equivalent: `node scripts/seed-tess-develop.js`.

### Parent-refuse error (required)

If `SUPABASE_URL` is parent (or you export the parent URL by mistake):

```bash
SUPABASE_URL=https://krcwpupbdizzjyydzaqp.supabase.co npm run seed:tess
```

Expected (exit 1):

```text
XVfinance Tess develop seed aborted: Refused parent/prod Supabase ref "krcwpupbdizzjyydzaqp" (https://krcwpupbdizzjyydzaqp.supabase.co). Tess QA fixtures may only be written to develop ref bkwhqfkosxnoffpsjcug (https://bkwhqfkosxnoffpsjcug.supabase.co). Never seed Tess/QA data into the parent project.
```

A missing URL or a third `*.supabase.co` project also exits non-zero with `XVfinance Tess develop seed aborted: …`.

### Expected fixture inventory summary

| Count | What |
| --- | --- |
| 2 | Tess-labeled tenants (Alpha Wealth, Beta Advisors) |
| 4 | Firm members (not platform admin): Alpha/Beta `manager` + `analyst` |
| 3 | Clients + contacts |
| 3 | Portfolios with cash/liquidity |
| 3 | Holdings (SPY/AAPL) |
| 3 | Notes |
| 2 | Watchlists |
| 1 | Pending manager-gated proposal |
| 1 | Draft report |
| 3 | `audit_events` readable under firm RLS |
| 10 | Top IM jobs (see inventory below) |

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
