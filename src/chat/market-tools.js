/**
 * CA-7.2 market read tools (equities-first). User JWT + allowlist; stub if no live key.
 * Audit entity_id is uuid — never the ticker string (BUG-B10).
 * Prefer instruments.id; else a stable namespace UUID v5 for the symbol.
 */
import { asAuditEntityId, marketInstrumentEntityId } from '../audit/entity-id.js';
import { createMarketProvider } from '../market/provider.js';
import { badArgs } from './tool-error.js';

function requireSymbol(args) {
  const symbol = String(args?.symbol ?? '').trim();
  if (!symbol) {
    throw badArgs('symbol is required');
  }
  return symbol;
}

function providerFor(env) {
  return createMarketProvider(env);
}

function marketAudit(action, { args, data }) {
  return {
    action,
    entityTable: 'instruments',
    entityId: marketInstrumentEntityId({
      instrumentId: data?.instrument_id,
      symbol: data?.symbol ?? args?.symbol,
    }),
    sensitive: false,
  };
}

/**
 * Firm-scoped instruments.id when the user client can see the row. Never throws.
 * @param {object} [client]
 * @param {{ firmId?: string }} [session]
 * @param {string} symbol
 */
async function lookupInstrumentId(client, session, symbol) {
  if (typeof client?.from !== 'function' || !session?.firmId || !symbol) {
    return null;
  }
  try {
    const query = client.from('instruments').select('id').eq('firm_id', session.firmId).eq(
      'symbol',
      String(symbol).trim().toUpperCase()
    );
    const result = typeof query.maybeSingle === 'function' ? await query.maybeSingle() : await query;
    const row = result?.data;
    const id = Array.isArray(row) ? row[0]?.id : row?.id;
    return asAuditEntityId(id);
  } catch {
    return null;
  }
}

async function withInstrumentId(client, session, payload) {
  const instrumentId = await lookupInstrumentId(client, session, payload.symbol);
  if (!instrumentId) {
    return payload;
  }
  return { ...payload, instrument_id: instrumentId };
}

export const MARKET_TOOLS = {
  get_quote: {
    description: 'Get an equities quote from the market provider (stub if no live key).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['symbol'],
      properties: { symbol: { type: 'string' } },
    },
    audit: ({ args, data }) => marketAudit('market.quote', { args, data }),
    async handler({ args, env, client, session }) {
      const payload = await providerFor(env).getQuote({ symbol: requireSymbol(args) });
      return withInstrumentId(client, session, payload);
    },
  },
  get_fundamentals: {
    description: 'Get equities fundamentals from the market provider (stub if no live key).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['symbol'],
      properties: { symbol: { type: 'string' } },
    },
    audit: ({ args, data }) => marketAudit('market.fundamentals', { args, data }),
    async handler({ args, env, client, session }) {
      const payload = await providerFor(env).getFundamentals({ symbol: requireSymbol(args) });
      return withInstrumentId(client, session, payload);
    },
  },
  get_news_headlines: {
    description: 'Get equities news headlines from the market provider (stub if no live key).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['symbol'],
      properties: {
        symbol: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
    },
    audit: ({ args, data }) => marketAudit('market.news', { args, data }),
    async handler({ args, env, client, session }) {
      const payload = await providerFor(env).getNewsHeadlines({
        symbol: requireSymbol(args),
        limit: args.limit ?? 5,
      });
      return withInstrumentId(client, session, payload);
    },
  },
  search_instruments: {
    description: 'Search instruments (equities-first) via the market provider.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['q'],
      properties: {
        q: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
    },
    audit: {
      action: 'market.search',
      entityTable: 'instruments',
      sensitive: false,
    },
    async handler({ args, env }) {
      const q = String(args.q ?? '').trim();
      if (!q) {
        throw badArgs('q is required');
      }
      return providerFor(env).searchInstruments({ q, limit: args.limit ?? 8 });
    },
  },
};
