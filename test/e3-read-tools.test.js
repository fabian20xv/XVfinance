import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dispatchTool, listToolNames } from '../src/chat/tool-router.js';
import {
  SMOKE_CLIENT_ID,
  SMOKE_CONTACT_ID,
  SMOKE_FIRM_ID,
  SMOKE_HOLDING_ID,
  SMOKE_INSTRUMENT_ID,
  SMOKE_MANAGER_ID,
  SMOKE_NOTE_ID,
  SMOKE_PORTFOLIO_ID,
  SMOKE_WATCHLIST_ID,
  SMOKE_WATCHLIST_ITEM_ID,
} from '../src/db/smoke-ids.js';
import { createMemoryClient } from './helpers/memory-client.js';

const env = {
  SUPABASE_URL: 'https://krcwpupbdizzjyydzaqp.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
};

const session = {
  userId: SMOKE_MANAGER_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'manager',
};

function seed() {
  return createMemoryClient({
    clients: [
      {
        id: SMOKE_CLIENT_ID,
        firm_id: SMOKE_FIRM_ID,
        display_name: 'Smoke Client',
        legal_name: 'Smoke Client LLC',
        status: 'active',
        external_ref: 'smoke-client',
      },
    ],
    portfolios: [
      {
        id: SMOKE_PORTFOLIO_ID,
        firm_id: SMOKE_FIRM_ID,
        client_id: SMOKE_CLIENT_ID,
        name: 'Smoke Balanced',
        base_currency: 'USD',
        cash_balance: '250000.0000',
        cash_currency: 'USD',
        liquidity_available: '200000.0000',
        liquidity_buffer: '50000.0000',
        liquidity_updated_at: '2026-09-18T00:00:00.000Z',
      },
    ],
    instruments: [
      {
        id: SMOKE_INSTRUMENT_ID,
        firm_id: SMOKE_FIRM_ID,
        symbol: 'SPY',
        name: 'SPDR S&P 500 ETF',
      },
    ],
    holdings: [
      {
        id: SMOKE_HOLDING_ID,
        firm_id: SMOKE_FIRM_ID,
        portfolio_id: SMOKE_PORTFOLIO_ID,
        instrument_id: SMOKE_INSTRUMENT_ID,
        quantity: '100',
        cost_basis: '45000',
        as_of: '2026-09-18',
      },
    ],
    contacts: [
      {
        id: SMOKE_CONTACT_ID,
        firm_id: SMOKE_FIRM_ID,
        client_id: SMOKE_CLIENT_ID,
        full_name: 'Pat Smoke',
        email: 'pat.smoke@xvfinance.invalid',
        phone: null,
        title: null,
        is_primary: true,
      },
    ],
    notes: [
      {
        id: SMOKE_NOTE_ID,
        firm_id: SMOKE_FIRM_ID,
        client_id: SMOKE_CLIENT_ID,
        body: 'Smoke note: IPS review scheduled.',
        created_by: SMOKE_MANAGER_ID,
        created_at: '2026-09-18T00:00:00.000Z',
        updated_at: '2026-09-18T00:00:00.000Z',
      },
    ],
    watchlists: [
      {
        id: SMOKE_WATCHLIST_ID,
        firm_id: SMOKE_FIRM_ID,
        name: 'Smoke Watch',
        created_by: SMOKE_MANAGER_ID,
      },
    ],
    watchlist_items: [
      {
        id: SMOKE_WATCHLIST_ITEM_ID,
        firm_id: SMOKE_FIRM_ID,
        watchlist_id: SMOKE_WATCHLIST_ID,
        instrument_id: SMOKE_INSTRUMENT_ID,
        symbol: 'SPY',
        label: 'S&P 500 ETF',
        note: null,
      },
    ],
    workspace_focus: [
      {
        user_id: SMOKE_MANAGER_ID,
        firm_id: SMOKE_FIRM_ID,
        client_id: SMOKE_CLIENT_ID,
        portfolio_id: SMOKE_PORTFOLIO_ID,
        watchlist_id: SMOKE_WATCHLIST_ID,
        updated_at: '2026-09-18T00:00:00.000Z',
      },
    ],
  });
}

async function run(name, args, client = seed()) {
  return dispatchTool({
    name,
    args,
    session,
    userJwt: 'user-jwt',
    env,
    createUserClient: () => client,
  });
}

describe('CA-3 read tools + workspace focus', () => {
  it('registers E3 tools on the E2 allowlist', () => {
    const names = listToolNames();
    for (const name of [
      'get_session_context',
      'set_workspace_focus',
      'list_clients',
      'get_client',
      'list_portfolios',
      'get_portfolio',
      'list_holdings',
      'get_holding',
      'get_contact',
      'list_notes',
      'get_note',
      'list_watchlists',
      'get_watchlist',
      'list_watchlist_items',
    ]) {
      assert.ok(names.includes(name), name);
    }
  });

  it('returns session context with workspace focus', async () => {
    const result = await run('get_session_context', {});
    assert.equal(result.ok, true);
    assert.equal(result.data.firm_id, SMOKE_FIRM_ID);
    assert.equal(result.data.role, 'manager');
    assert.equal(result.data.focus.client_id, SMOKE_CLIENT_ID);
    assert.equal(result.data.focus.portfolio_id, SMOKE_PORTFOLIO_ID);
    assert.equal(result.audit.action, 'session.context.read');
  });

  it('sets workspace focus after validating firm-scoped ids', async () => {
    const client = seed();
    const result = await run(
      'set_workspace_focus',
      { client_id: SMOKE_CLIENT_ID, portfolio_id: SMOKE_PORTFOLIO_ID },
      client
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.focus.client_id, SMOKE_CLIENT_ID);
    assert.equal(result.data.focus.watchlist_id, null);
  });

  it('lists clients with minimized labels and pagination', async () => {
    const result = await run('list_clients', { limit: 20, offset: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.data.items.length, 1);
    assert.deepEqual(Object.keys(result.data.items[0]).sort(), ['id', 'label', 'status']);
    assert.equal(result.data.items[0].label, 'Smoke Client');
    assert.equal(result.data.has_more, false);
    assert.equal(result.data.items[0].legal_name, undefined);
  });

  it('reads portfolio cash and liquidity fields from E1', async () => {
    const result = await run('get_portfolio', { portfolio_id: SMOKE_PORTFOLIO_ID });
    assert.equal(result.ok, true);
    assert.equal(result.data.cash_balance, 250000);
    assert.equal(result.data.liquidity_available, 200000);
    assert.equal(result.data.liquidity_buffer, 50000);
    assert.equal(result.data.cash.cash_currency, 'USD');
    assert.equal(result.audit.action, 'portfolio.read');
  });

  it('lists holdings with instrument symbols as labels', async () => {
    const result = await run('list_holdings', { portfolio_id: SMOKE_PORTFOLIO_ID, limit: 10 });
    assert.equal(result.ok, true);
    assert.equal(result.data.items[0].label, 'SPY');
    assert.equal(result.data.items[0].quantity, 100);
  });

  it('audits get_contact and list/get notes without returning extra list PII', async () => {
    const contact = await run('get_contact', { contact_id: SMOKE_CONTACT_ID });
    assert.equal(contact.ok, true);
    assert.equal(contact.data.email, 'pat.smoke@xvfinance.invalid');
    assert.equal(contact.audit.action, 'contact.read');
    assert.equal(contact.audit.entityId, SMOKE_CONTACT_ID);
    assert.equal(contact.audit.sensitive, true);

    const notes = await run('list_notes', { client_id: SMOKE_CLIENT_ID });
    assert.equal(notes.ok, true);
    assert.equal(notes.audit.action, 'notes.list');
    assert.equal(notes.data.items[0].body, undefined);
    assert.match(notes.data.items[0].label, /IPS review/);

    const note = await run('get_note', { note_id: SMOKE_NOTE_ID });
    assert.equal(note.ok, true);
    assert.equal(note.data.body, 'Smoke note: IPS review scheduled.');
    assert.equal(note.audit.action, 'note.read');
  });

  it('reads watchlists and items', async () => {
    const list = await run('list_watchlists', {});
    assert.equal(list.ok, true);
    assert.equal(list.data.items[0].label, 'Smoke Watch');

    const one = await run('get_watchlist', { watchlist_id: SMOKE_WATCHLIST_ID });
    assert.equal(one.ok, true);
    assert.equal(one.data.items[0].symbol, 'SPY');
  });
});
