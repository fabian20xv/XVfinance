import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHoldingsCsv, matchHoldingsRows } from '../src/csv/holdings-csv.js';
import { dispatchTool, listToolNames } from '../src/chat/tool-router.js';
import { FIRM_IMPORTS_BUCKET } from '../src/chat/import-tools.js';
import { requiresRoleForKind } from '../src/proposals/defaults.js';
import {
  SMOKE_ANALYST_ID,
  SMOKE_FIRM_ID,
  SMOKE_INSTRUMENT_ID,
  SMOKE_MANAGER_ID,
  SMOKE_PORTFOLIO_ID,
} from '../src/db/smoke-ids.js';
import { createMemoryClient } from './helpers/memory-client.js';

const env = {
  SUPABASE_URL: 'https://krcwpupbdizzjyydzaqp.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
};

const analyst = {
  userId: SMOKE_ANALYST_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'analyst',
};

const manager = {
  userId: SMOKE_MANAGER_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'manager',
};

function db() {
  return createMemoryClient({
    portfolios: [{ id: SMOKE_PORTFOLIO_ID, firm_id: SMOKE_FIRM_ID, name: 'Smoke Balanced' }],
    instruments: [{ id: SMOKE_INSTRUMENT_ID, firm_id: SMOKE_FIRM_ID, symbol: 'SPY' }],
    proposals: [],
  });
}

async function run(name, args, { session = analyst, client = db() } = {}) {
  return {
    result: await dispatchTool({
      name,
      args,
      session,
      userJwt: 'user-jwt',
      env,
      createUserClient: () => client,
    }),
    client,
  };
}

describe('CA-6 CSV holdings import', () => {
  it('parses symbol/quantity CSV and matches firm instruments', () => {
    const { rows } = parseHoldingsCsv(
      'symbol,quantity,cost_basis,as_of\nSPY,110,50000,2026-09-18\nAAPL,5,1000,2026-09-18\n'
    );
    assert.equal(rows.length, 2);
    const { matched, unmatched } = matchHoldingsRows(rows, [
      { id: SMOKE_INSTRUMENT_ID, symbol: 'SPY' },
    ]);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].instrument_id, SMOKE_INSTRUMENT_ID);
    assert.equal(unmatched[0].symbol, 'AAPL');
  });

  it('registers import_holdings_csv and defaults confirm to manager', () => {
    assert.ok(listToolNames().includes('import_holdings_csv'));
    assert.equal(requiresRoleForKind('holdings_import'), 'manager');
  });

  it('uploads under the firm prefix and opens a holdings_import proposal', async () => {
    const csv = 'ticker,qty\nSPY,110\n';
    const { result, client } = await run('import_holdings_csv', {
      portfolio_id: SMOKE_PORTFOLIO_ID,
      csv,
      filename: 'holdings.csv',
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.kind, 'holdings_import');
    assert.equal(result.data.requires_role, 'manager');
    assert.equal(result.data.payload.unmatched.length, 0);
    assert.equal(result.data.payload.matched[0].symbol, 'SPY');
    assert.match(result.data.payload.storage_path, new RegExp(`^${SMOKE_FIRM_ID}/`));
    assert.match(result.data.payload.storage_path, new RegExp(`/${SMOKE_ANALYST_ID}/`));
    assert.equal(result.data.payload.bucket, FIRM_IMPORTS_BUCKET);
    assert.equal(client.db._storage[0].bucket, FIRM_IMPORTS_BUCKET);
    assert.equal(client.db._storage[0].path, result.data.payload.storage_path);
  });

  it('blocks confirm when unmatched symbols are present', async () => {
    const { result, client } = await run('import_holdings_csv', {
      portfolio_id: SMOKE_PORTFOLIO_ID,
      csv: 'symbol,quantity\nSPY,10\nZZZZ,1\n',
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.payload.unmatched[0].symbol, 'ZZZZ');
    assert.equal(result.data.preview.confirm_blocked, true);

    const confirmed = await dispatchTool({
      name: 'confirm_proposal',
      args: { proposal_id: result.data.id },
      session: manager,
      userJwt: 'user-jwt',
      env,
      createUserClient: () => client,
    });
    assert.equal(confirmed.ok, false);
    assert.equal(confirmed.error.code, 'unmatched_symbols');
  });
});
