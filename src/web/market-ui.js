/**
 * Market polish A — shared payload shaping for chat cards and the workspace pane.
 * Read-only. No routes, no writes.
 */

export const MARKET_TOOLS = Object.freeze([
  'get_quote',
  'get_fundamentals',
  'get_news_headlines',
  'search_instruments',
]);

const SLOT_BY_TOOL = Object.freeze({
  get_quote: 'quote',
  get_fundamentals: 'fundamentals',
  get_news_headlines: 'news',
  search_instruments: 'search',
});

export function isMarketTool(name) {
  return Object.prototype.hasOwnProperty.call(SLOT_BY_TOOL, name);
}

export function marketSlot(name) {
  return SLOT_BY_TOOL[name] ?? null;
}

/**
 * Stub when the payload says so, or the provider id is the stub adapter.
 * @param {unknown} payload
 */
export function isStubMarket(payload) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  if (payload.stub === true) {
    return true;
  }
  return payload.provider === 'stub';
}

export function formatQuoteLast(last) {
  if (last == null || last === '') {
    return 'N/A';
  }
  const value = typeof last === 'number' ? last : Number(last);
  if (!Number.isFinite(value)) {
    return 'N/A';
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Signed change line, or null when the provider omitted it (stub quotes).
 * @param {Record<string, unknown> | null | undefined} payload
 */
export function formatQuoteChange(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const change = payload.change ?? payload.change_abs ?? null;
  const pct = payload.change_pct ?? payload.change_percent ?? payload.percent_change ?? null;
  const parts = [];
  if (change != null && change !== '' && Number.isFinite(Number(change))) {
    const value = Number(change);
    parts.push(`${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  }
  if (pct != null && pct !== '' && Number.isFinite(Number(pct))) {
    const value = Number(pct);
    parts.push(`${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export function formatAsOf(asOf) {
  if (asOf == null || asOf === '') {
    return 'N/A';
  }
  const date = new Date(String(asOf));
  if (Number.isNaN(date.getTime())) {
    return String(asOf);
  }
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMarketField(value) {
  if (value == null || value === '') {
    return 'N/A';
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return 'N/A';
  }
  return String(value);
}

export function formatMarketCap(value) {
  if (value == null || value === '') {
    return 'N/A';
  }
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) {
    return String(value);
  }
  const abs = Math.abs(amount);
  if (abs >= 1e12) {
    return `${(amount / 1e12).toFixed(2)}T`;
  }
  if (abs >= 1e9) {
    return `${(amount / 1e9).toFixed(2)}B`;
  }
  if (abs >= 1e6) {
    return `${(amount / 1e6).toFixed(2)}M`;
  }
  return amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function emptyMarketWorkspace() {
  return { quote: null, fundamentals: null, news: null, search: null };
}

/**
 * @param {Record<string, unknown> | null | undefined} state
 * @param {string} name
 * @param {unknown} payload
 */
export function applyMarketWorkspace(state, name, payload) {
  const next = { ...emptyMarketWorkspace(), ...(state && typeof state === 'object' ? state : {}) };
  const slot = marketSlot(name);
  if (!slot || !payload || typeof payload !== 'object') {
    return next;
  }
  next[slot] = payload;
  return next;
}

export function marketWorkspaceHasContent(state) {
  if (!state || typeof state !== 'object') {
    return false;
  }
  return Boolean(state.quote || state.fundamentals || state.news || state.search);
}

/**
 * Fold one successful market tool into the done-event artifact.
 * @param {Record<string, unknown> | null | undefined} market
 * @param {string} name
 * @param {unknown} data
 */
export function applyMarketArtifact(market, name, data) {
  const slot = marketSlot(name);
  if (!slot || !data || typeof data !== 'object') {
    return market ?? null;
  }
  return { ...(market && typeof market === 'object' ? market : {}), [slot]: data };
}

/**
 * @param {Record<string, unknown> | null | undefined} artifact
 * @param {Record<string, unknown> | null | undefined} prev
 */
/**
 * @param {Record<string, unknown> | null | undefined} artifact
 * @param {string | null | undefined} name
 */
export function payloadFromArtifact(artifact, name) {
  const slot = marketSlot(name);
  if (!slot || !artifact || typeof artifact !== 'object') {
    return null;
  }
  const value = artifact[slot];
  return value && typeof value === 'object' ? value : null;
}

/**
 * @param {Record<string, unknown> | null | undefined} artifact
 * @param {Record<string, unknown> | null | undefined} prev
 */
export function workspaceFromArtifact(artifact, prev = null) {
  const base = { ...emptyMarketWorkspace(), ...(prev && typeof prev === 'object' ? prev : {}) };
  if (!artifact || typeof artifact !== 'object') {
    return base;
  }
  for (const slot of Object.values(SLOT_BY_TOOL)) {
    if (artifact[slot] && typeof artifact[slot] === 'object') {
      base[slot] = artifact[slot];
    }
  }
  return base;
}

/**
 * @param {unknown} payload
 */
export function headlineRows(payload) {
  const rows = payload && typeof payload === 'object' ? payload.headlines ?? payload.items : null;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.slice(0, 5).map((row) => {
    if (typeof row === 'string') {
      return { title: row, source: null };
    }
    if (!row || typeof row !== 'object') {
      return { title: 'Untitled', source: null };
    }
    return {
      title: String(row.title ?? row.headline ?? row.summary ?? 'Untitled'),
      source: row.source ?? row.publisher ?? null,
    };
  });
}

/**
 * @param {unknown} payload
 */
export function searchRows(payload) {
  const rows = payload && typeof payload === 'object' ? payload.items ?? payload.results : null;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.slice(0, 8).map((row) => {
    if (!row || typeof row !== 'object') {
      return { symbol: '—', name: null };
    }
    return {
      symbol: row.symbol ? String(row.symbol) : '—',
      name: row.name ? String(row.name) : null,
    };
  });
}
