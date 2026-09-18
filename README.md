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

## Setup

```bash
cp .env.example .env   # placeholders only; never commit real keys
npm install
npm run ci             # lock assert + lint + tests
```

Start (requires `SUPABASE_URL` in the environment):

```bash
node --env-file=.env src/index.js
```
