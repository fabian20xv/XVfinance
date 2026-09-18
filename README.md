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

Any other host, origin, or ref (including other `*.supabase.co` projects) is refused. A third ref fails with the same loud `Refused Supabase project ref` error as a missing URL.

## Service-role isolation (CA-0.2)

The service-role key is a server secret. It must never reach the model, the chat tool runner, or a client bundle.

| Code path | Service-role allowed? |
| --- | --- |
| `src/server/` (e.g. `service-role.js`) | Yes — only locked-down server modules |
| `src/chat/` (tool runner + user-JWT client) | No — user JWT + anon/publishable key; env is stripped |
| `src/client/` | No — public URL + anon/publishable key only |
| `src/http/` (health + smoke) | No — smoke uses the user-JWT client so RLS applies |

`createChatToolRunner` builds a frozen env **without** service-role secrets and requires a user JWT so RLS applies. ESLint rule `xvfinance/no-service-role-in-chat` (chat + client files) and `test/service-role-isolation.test.js` fail if those trees (and `src/http/`) read the key or import `src/server`.

## Tess health / smoke HTTP API

`npm start` boots the allowlist lock and serves a minimal Node HTTP API (PORT default `3000`).

### `GET /api/health`

Unauthenticated liveness. Always `200` after a successful boot:

```json
{ "ok": true, "commit": "<sha or unknown>", "env": "<APP_ENV or VERCEL_ENV or development>", "supabaseRef": "<allowlisted ref>" }
```

- `commit` — `VERCEL_GIT_COMMIT_SHA`, else `GIT_COMMIT`, else `unknown`
- `env` — `APP_ENV`, else `VERCEL_ENV`, else `development`
- `supabaseRef` — the locked project ref from `SUPABASE_URL`

### `POST /api/smoke`

Staging-only probe. **Refused when `APP_ENV` or `VERCEL_ENV` is `production`** (`403`). Requires header `x-smoke-secret` matching env `SMOKE_SECRET` (`401` if missing/wrong/unset). Never logs the secret, user JWT, or service-role key.

Steps (each returns `ok`, `ms`, and skip/error detail):

1. **boot** — re-run the allowlist lock
2. **auth** — if `SMOKE_USER_JWT` is set, create a user-JWT client (RLS) and call `auth.getUser`; otherwise `{ skipped: true, reason: "SMOKE_USER_JWT not set" }`
3. **db** — if `SMOKE_DB_TABLE` is set, `select` (`SMOKE_DB_SELECT`, default `id`) `limit 1` via that user-JWT client; otherwise skip with a clear reason (`SMOKE_DB_TABLE not set`, or no JWT)

Overall `200` when every step is ok (skipped counts as ok); `503` if a step fails.

## Setup

```bash
cp .env.example .env   # placeholders only; never commit real keys
npm install
npm run ci             # lock assert + lint + tests
```

Start (requires `SUPABASE_URL` in the environment):

```bash
node --env-file=.env src/index.js
# or: npm start
```
