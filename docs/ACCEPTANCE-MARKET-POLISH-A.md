# ACCEPTANCE-MARKET-POLISH-A

Pete locked. Ship the thin UI against this bar only. Tess develops Preview only (`bkwhqf` / `bkwhqfkosxnoffpsjcug`). Do not merge from this doc.

## Bar (locked)

| Gate | Pass condition |
| --- | --- |
| Composer tools | develop Preview composer drives **CA-7 only**: `get_quote`, `search_instruments`, `get_fundamentals`, `get_news_headlines` |
| Stub | Stub is OK **iff** it is **visibly labeled** (amber **Stub / sample data** on chat cards and Market pane) |
| Live | Live when `MARKET_API_KEY` is real **and** `MARKET_API_BASE` is set (both required per `src/market/provider.js`) |
| Quote → pane | A successful `get_quote` **must** paint a **non-blank** Market workspace panel |
| Scope | No new `/v1` invent; read-only; Tess develop only (`bkwhqf`); no CRM / voice / new providers |

## Stub-first (Preview today)

On develop Preview, `get_quote` for SPY is expected stub (`last: null`) until the env fix lands. That is a **pass** when:

1. **Stub / sample data** is visible on the quote card and Market pane.
2. Cards stay readable with null `last` / `pe` / `market_cap` (symbol, name, currency, N/A — never blank or broken).
3. Quote still opens a **non-blank** Market workspace pane in stub mode.
4. Live `MARKET_API_KEY` + `MARKET_API_BASE` is later — do not block the PR on a live provider.

## Env fix (smallest change — for live later)

On **Vercel Preview** only (Tess develop / `bkwhqf`):

1. Edit **only** `MARKET_API_KEY` if it is still a placeholder (`replace-with*`, `stub`, `placeholder`, or empty).
2. Ensure **`MARKET_API_BASE`** is a real non-empty URL.
3. Do **not** re-enter other secrets.

## Tess checklist (develop Preview · `bkwhqf`)

Sign in on the develop Preview deployment pointed at Supabase ref `bkwhqfkosxnoffpsjcug`. Use the left-pane composer (natural language). Confirm tool pills name the CA-7 tools below.

1. **`get_quote`** — Ask for a quote (e.g. SPY). Expect a quote card under the tool pill **and** a non-blank Market pane on the right. If stub: amber **Stub / sample data**; last may be **N/A**. If live: muted **Live**, no stub badge, last/currency/as-of from provider.
2. **`search_instruments`** — Ask to search an equity (e.g. Apple). Expect a light search summary + Market pane update; stub labeled when stub.
3. **`get_fundamentals`** — Ask for fundamentals on a symbol. Expect sector / P/E / mcap (or **N/A**); stub labeled when stub.
4. **`get_news_headlines`** — Ask for headlines on a symbol. Expect a light news summary (or “No headlines”); stub labeled when stub.
5. **Stub vs live** — With placeholder/missing market key: stub badge everywhere market data shows. After the Preview env fix above: Live label, no stub badge.
6. **Scope guards** — No new `/v1/market*` routes. Confirm-on-write unchanged. No writes from market tools. Parent/prod (`krcwpupbdizzjyydzaqp`) untouched; Tess develop only.

## Out of scope

New API routes, new market providers, CRM, voice, middleware.ts, service-role under `src/ai/**`.
