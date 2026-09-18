/**
 * Holdings CSV parser (no extra deps). Columns: symbol, quantity, cost_basis?, as_of?
 */

const HEADER_ALIASES = {
  symbol: 'symbol',
  ticker: 'symbol',
  isin: 'symbol',
  quantity: 'quantity',
  qty: 'quantity',
  shares: 'quantity',
  amount: 'quantity',
  cost_basis: 'cost_basis',
  cost: 'cost_basis',
  costbasis: 'cost_basis',
  as_of: 'as_of',
  asof: 'as_of',
  date: 'as_of',
};

/**
 * @param {string} line
 * @returns {string[]}
 */
export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function parseNumber(value, label, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) {
      throw new Error(`${label} is required`);
    }
    return null;
  }
  const n = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) {
    throw new Error(`${label} must be a number`);
  }
  return n;
}

/**
 * @param {string} csv
 * @returns {{ rows: object[], headers: string[] }}
 */
export function parseHoldingsCsv(csv) {
  if (csv == null || String(csv).trim() === '') {
    throw new Error('CSV is empty');
  }
  const lines = String(csv)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    throw new Error('CSV must include a header and at least one data row');
  }

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? normalizeHeader(h));
  if (!headers.includes('symbol') || !headers.includes('quantity')) {
    throw new Error('CSV header must include symbol and quantity');
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const raw = {};
    headers.forEach((key, index) => {
      raw[key] = cols[index] ?? '';
    });
    const symbol = String(raw.symbol ?? '')
      .trim()
      .toUpperCase();
    if (!symbol) {
      throw new Error(`Row ${i + 1} is missing symbol`);
    }
    const quantity = parseNumber(raw.quantity, `Row ${i + 1} quantity`, { required: true });
    const cost_basis = parseNumber(raw.cost_basis, `Row ${i + 1} cost_basis`);
    const as_of = raw.as_of ? String(raw.as_of).trim() : null;
    rows.push({
      symbol,
      quantity,
      ...(cost_basis != null ? { cost_basis } : {}),
      ...(as_of ? { as_of } : {}),
      line: i + 1,
    });
  }

  if (rows.length === 0) {
    throw new Error('CSV has no holdings rows');
  }
  return { rows, headers };
}

/**
 * @param {Array<{ symbol: string, quantity: number, cost_basis?: number, as_of?: string, line?: number }>} rows
 * @param {Array<{ id: string, symbol: string }>} instruments
 */
export function matchHoldingsRows(rows, instruments) {
  const bySymbol = new Map();
  for (const instrument of instruments ?? []) {
    bySymbol.set(String(instrument.symbol ?? '').toUpperCase(), instrument);
  }
  const matched = [];
  const unmatched = [];
  for (const row of rows) {
    const instrument = bySymbol.get(row.symbol);
    if (!instrument) {
      unmatched.push({ symbol: row.symbol, line: row.line ?? null, quantity: row.quantity });
      continue;
    }
    matched.push({
      op: 'upsert',
      symbol: row.symbol,
      instrument_id: instrument.id,
      quantity: row.quantity,
      ...(row.cost_basis != null ? { cost_basis: row.cost_basis } : {}),
      ...(row.as_of ? { as_of: row.as_of } : {}),
      line: row.line ?? null,
    });
  }
  return { matched, unmatched };
}
