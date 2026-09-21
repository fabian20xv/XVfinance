/**
 * CA-7.2 market read tools (equities-first). User JWT + allowlist; stub if no live key.
 * Audit entity_id is uuid — never the ticker string (BUG-B10).
 */
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

export const MARKET_TOOLS = {
  get_quote: {
    description: 'Get an equities quote from the market provider (stub if no live key).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['symbol'],
      properties: { symbol: { type: 'string' } },
    },
    audit: () => ({
      action: 'market.quote',
      entityTable: 'instruments',
      entityId: null,
      sensitive: false,
    }),
    async handler({ args, env }) {
      return providerFor(env).getQuote({ symbol: requireSymbol(args) });
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
    audit: () => ({
      action: 'market.fundamentals',
      entityTable: 'instruments',
      entityId: null,
      sensitive: false,
    }),
    async handler({ args, env }) {
      return providerFor(env).getFundamentals({ symbol: requireSymbol(args) });
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
    audit: () => ({
      action: 'market.news',
      entityTable: 'instruments',
      entityId: null,
      sensitive: false,
    }),
    async handler({ args, env }) {
      return providerFor(env).getNewsHeadlines({
        symbol: requireSymbol(args),
        limit: args.limit ?? 5,
      });
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
