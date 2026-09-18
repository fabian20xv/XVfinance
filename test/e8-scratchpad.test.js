import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dispatchTool, listToolNames } from '../src/chat/tool-router.js';
import { SCRATCHPAD_UI, SCRATCHPAD_WATERMARK } from '../src/scratchpad/contract.js';
import { requiresRoleForKind } from '../src/proposals/defaults.js';
import {
  SMOKE_ANALYST_ID,
  SMOKE_FIRM_ID,
  SMOKE_HOLDING_ID,
  SMOKE_INSTRUMENT_ID,
  SMOKE_PORTFOLIO_ID,
  SMOKE_SCRATCHPAD_ID,
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

function db() {
  return createMemoryClient({
    instruments: [
      { id: SMOKE_INSTRUMENT_ID, firm_id: SMOKE_FIRM_ID, symbol: 'SPY', name: 'SPDR S&P 500 ETF' },
    ],
    holdings: [
      {
        id: SMOKE_HOLDING_ID,
        firm_id: SMOKE_FIRM_ID,
        portfolio_id: SMOKE_PORTFOLIO_ID,
        instrument_id: SMOKE_INSTRUMENT_ID,
        quantity: 100,
        cost_basis: 45000,
        as_of: '2026-09-18',
      },
    ],
    scratchpads: [
      {
        id: SMOKE_SCRATCHPAD_ID,
        firm_id: SMOKE_FIRM_ID,
        portfolio_id: SMOKE_PORTFOLIO_ID,
        created_by: SMOKE_ANALYST_ID,
        name: 'Smoke impact',
        scenario: {
          holdings: [{ instrument_id: SMOKE_INSTRUMENT_ID, symbol: 'SPY', quantity: 120 }],
        },
        watermark: SCRATCHPAD_WATERMARK,
      },
    ],
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

describe('CA-8 impact scratchpad', () => {
  it('registers watermarked scratchpad tools and manager promote', () => {
    const names = listToolNames();
    for (const name of [
      'create_scratchpad',
      'update_scratchpad',
      'get_scratchpad',
      'get_scratchpad_impact',
      'promote_scratchpad',
    ]) {
      assert.ok(names.includes(name), name);
    }
    assert.equal(requiresRoleForKind('scratchpad_promote'), 'manager');
  });

  it('returns a watermarked UI contract that is not source of truth', async () => {
    const { result } = await run('get_scratchpad', { scratchpad_id: SMOKE_SCRATCHPAD_ID });
    assert.equal(result.ok, true);
    assert.equal(result.data.ui, SCRATCHPAD_UI);
    assert.equal(result.data.watermark, SCRATCHPAD_WATERMARK);
    assert.equal(result.data.source_of_truth, false);
    assert.equal(result.data.live, false);
  });

  it('computes read-only impact versus live holdings without mutating them', async () => {
    const { result, client } = await run('get_scratchpad_impact', {
      scratchpad_id: SMOKE_SCRATCHPAD_ID,
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.read_only, true);
    assert.equal(result.data.impact.changed[0].from_quantity, 100);
    assert.equal(result.data.impact.changed[0].to_quantity, 120);
    assert.equal(client.db.holdings[0].quantity, 100);
  });

  it('promotes to a pending proposal and does not write holdings until confirm', async () => {
    const { result, client } = await run('promote_scratchpad', {
      scratchpad_id: SMOKE_SCRATCHPAD_ID,
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.kind, 'scratchpad_promote');
    assert.equal(result.data.status, 'pending');
    assert.equal(result.data.requires_role, 'manager');
    assert.equal(result.data.payload.source_of_truth, false);
    assert.equal(result.data.payload.watermark, SCRATCHPAD_WATERMARK);
    assert.equal(result.data.payload.changes[0].quantity, 120);
    assert.equal(client.db.holdings[0].quantity, 100);
    assert.equal(client.db.proposals.length, 1);
    assert.equal(client.db.proposals[0].status, 'pending_confirm');
  });
});
