/**
 * CA-7.1 market data provider adapter.
 * Live HTTP is used only when MARKET_API_KEY is set; otherwise a stub (equities-first).
 */

export const STUB_PROVIDER_ID = 'stub';

const STUB_EQUITIES = Object.freeze([
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', asset_class: 'equity', currency: 'USD' },
  { symbol: 'AAPL', name: 'Apple Inc.', asset_class: 'equity', currency: 'USD' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', asset_class: 'equity', currency: 'USD' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', asset_class: 'equity', currency: 'USD' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', asset_class: 'equity', currency: 'USD' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', asset_class: 'equity', currency: 'USD' },
]);

function upperSymbol(symbol) {
  return String(symbol ?? '')
    .trim()
    .toUpperCase();
}

function findStubEquity(symbol) {
  const needle = upperSymbol(symbol);
  return STUB_EQUITIES.find((row) => row.symbol === needle) ?? null;
}

/**
 * @typedef {object} MarketProvider
 * @property {(args: { symbol: string }) => Promise<object>} getQuote
 * @property {(args: { symbol: string }) => Promise<object>} getFundamentals
 * @property {(args: { symbol: string, limit?: number }) => Promise<object>} getNewsHeadlines
 * @property {(args: { q: string, limit?: number }) => Promise<object>} searchInstruments
 */

export class StubMarketProvider {
  readonly = true;
  id = STUB_PROVIDER_ID;

  async getQuote({ symbol }) {
    const row = findStubEquity(symbol);
    return {
      provider: this.id,
      stub: true,
      asset_class: 'equity',
      symbol: upperSymbol(symbol),
      name: row?.name ?? null,
      last: null,
      currency: row?.currency ?? 'USD',
      as_of: null,
    };
  }

  async getFundamentals({ symbol }) {
    const row = findStubEquity(symbol);
    return {
      provider: this.id,
      stub: true,
      asset_class: 'equity',
      symbol: upperSymbol(symbol),
      name: row?.name ?? null,
      sector: null,
      pe: null,
      market_cap: null,
      currency: row?.currency ?? 'USD',
    };
  }

  async getNewsHeadlines({ symbol, limit = 5 }) {
    return {
      provider: this.id,
      stub: true,
      asset_class: 'equity',
      symbol: upperSymbol(symbol),
      headlines: [],
      limit,
    };
  }

  async searchInstruments({ q, limit = 8 }) {
    const needle = String(q ?? '')
      .trim()
      .toLowerCase();
    const items = STUB_EQUITIES.filter(
      (row) =>
        !needle ||
        row.symbol.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle)
    ).slice(0, Math.max(1, Math.min(Number(limit) || 8, 25)));
    return {
      provider: this.id,
      stub: true,
      asset_class_preference: 'equity',
      items,
    };
  }
}

/**
 * Thin live adapter. Requires MARKET_API_KEY + MARKET_API_BASE.
 * Equities-first query params; callers still go through the MarketProvider interface.
 */
export class HttpMarketProvider {
  readonly = true;

  /**
   * @param {{ apiKey: string, baseUrl: string, fetchImpl?: typeof fetch }} options
   */
  constructor({ apiKey, baseUrl, fetchImpl = fetch }) {
    this.id = 'http';
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  async #get(path, params) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value != null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    url.searchParams.set('asset_class', 'equity');
    const res = await this.fetchImpl(url, {
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Market provider HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  async getQuote({ symbol }) {
    const data = await this.#get('/quote', { symbol: upperSymbol(symbol) });
    return { provider: this.id, stub: false, asset_class: 'equity', ...data };
  }

  async getFundamentals({ symbol }) {
    const data = await this.#get('/fundamentals', { symbol: upperSymbol(symbol) });
    return { provider: this.id, stub: false, asset_class: 'equity', ...data };
  }

  async getNewsHeadlines({ symbol, limit = 5 }) {
    const data = await this.#get('/news', { symbol: upperSymbol(symbol), limit });
    return { provider: this.id, stub: false, asset_class: 'equity', ...data };
  }

  async searchInstruments({ q, limit = 8 }) {
    const data = await this.#get('/search', { q, limit });
    return { provider: this.id, stub: false, asset_class_preference: 'equity', ...data };
  }
}

export function hasLiveMarketKey(env = process.env) {
  const key = env?.MARKET_API_KEY;
  if (!key || typeof key !== 'string') {
    return false;
  }
  const trimmed = key.trim();
  if (!trimmed) {
    return false;
  }
  if (/^replace-with/i.test(trimmed) || trimmed === 'stub' || trimmed === 'placeholder') {
    return false;
  }
  return true;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {MarketProvider}
 */
export function createMarketProvider(env = process.env) {
  if (hasLiveMarketKey(env) && env.MARKET_API_BASE) {
    return new HttpMarketProvider({
      apiKey: env.MARKET_API_KEY,
      baseUrl: env.MARKET_API_BASE,
    });
  }
  return new StubMarketProvider();
}
