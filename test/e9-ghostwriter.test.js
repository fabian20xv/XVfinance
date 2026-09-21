import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dispatchTool, listToolNames } from '../src/chat/tool-router.js';
import { RECEIPTS_UI } from '../src/meetings/receipts.js';
import { requiresRoleForKind } from '../src/proposals/defaults.js';
import {
  SMOKE_ANALYST_ID,
  SMOKE_CLIENT_ID,
  SMOKE_FIRM_ID,
  SMOKE_HOLDING_ID,
  SMOKE_INSTRUMENT_ID,
  SMOKE_MANAGER_ID,
  SMOKE_MEETING_REPORT_ID,
  SMOKE_NOTE_ID,
  SMOKE_PORTFOLIO_ID,
  SMOKE_PROPOSAL_ID,
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
    clients: [{ id: SMOKE_CLIENT_ID, firm_id: SMOKE_FIRM_ID, display_name: 'Smoke Client', status: 'active' }],
    notes: [
      {
        id: SMOKE_NOTE_ID,
        firm_id: SMOKE_FIRM_ID,
        client_id: SMOKE_CLIENT_ID,
        body: 'Smoke note: IPS review scheduled.',
        created_at: '2026-09-18T00:00:00.000Z',
      },
    ],
    portfolios: [
      {
        id: SMOKE_PORTFOLIO_ID,
        firm_id: SMOKE_FIRM_ID,
        client_id: SMOKE_CLIENT_ID,
        name: 'Smoke Balanced',
        cash_balance: 250000,
        cash_currency: 'USD',
      },
    ],
    instruments: [{ id: SMOKE_INSTRUMENT_ID, firm_id: SMOKE_FIRM_ID, symbol: 'SPY' }],
    holdings: [
      {
        id: SMOKE_HOLDING_ID,
        firm_id: SMOKE_FIRM_ID,
        portfolio_id: SMOKE_PORTFOLIO_ID,
        instrument_id: SMOKE_INSTRUMENT_ID,
        quantity: 100,
        as_of: '2026-09-18',
      },
    ],
    proposals: [
      {
        id: SMOKE_PROPOSAL_ID,
        firm_id: SMOKE_FIRM_ID,
        kind: 'holding_changes',
        status: 'pending_confirm',
        preview: { title: 'Holding changes' },
        created_at: '2026-09-18T00:00:00.000Z',
      },
    ],
    reports: [
      {
        id: SMOKE_MEETING_REPORT_ID,
        firm_id: SMOKE_FIRM_ID,
        client_id: SMOKE_CLIENT_ID,
        title: 'Smoke meeting 1-pager',
        body: 'Draft',
        sections: [],
        receipts: [
          {
            id: 'r1',
            citation: 'R1',
            source_table: 'notes',
            source_id: SMOKE_NOTE_ID,
            firm_id: SMOKE_FIRM_ID,
            label: 'Client note',
            excerpt: 'Smoke note',
            path: `/v1/notes/${SMOKE_NOTE_ID}`,
            auditable: true,
            public_url: null,
          },
        ],
        purpose: 'meeting_one_pager',
        status: 'draft',
        created_by: SMOKE_ANALYST_ID,
        published_at: null,
        sent_at: null,
        send_channel: null,
      },
    ],
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

describe('CA-9 meeting ghostwriter + receipts', () => {
  it('registers ghostwrite, receipts, send, and export tools', () => {
    const names = listToolNames();
    for (const name of [
      'ghostwrite_meeting_one_pager',
      'get_meeting_one_pager',
      'get_meeting_receipts',
      'propose_meeting_send',
      'export_meeting_one_pager',
    ]) {
      assert.ok(names.includes(name), name);
    }
    assert.equal(requiresRoleForKind('meeting_send'), 'manager');
  });

  it('drafts a 1-pager that cites firm-scoped receipts and does not send', async () => {
    const { result, client } = await run('ghostwrite_meeting_one_pager', {
      client_id: SMOKE_CLIENT_ID,
      meeting_date: '2026-09-19',
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.purpose, 'meeting_one_pager');
    assert.equal(result.data.status, 'draft');
    assert.equal(result.data.public_url, null);
    assert.equal(result.data.client_facing, false);
    assert.equal(result.data.sent_at, null);
    assert.ok(result.data.receipts.length >= 2);
    assert.ok(result.data.receipts.every((row) => row.firm_id === SMOKE_FIRM_ID));
    assert.ok(result.data.receipts.every((row) => row.public_url === null));
    assert.ok(result.data.receipts.every((row) => row.auditable === true));
    assert.ok(result.data.body.includes('[R1]'));
    assert.equal(result.data.receipts_panel.ui, RECEIPTS_UI);
    assert.equal(client.db.reports.some((row) => row.status === 'draft' && row.sent_at == null), true);
  });

  it('returns a workspace receipts panel for the draft', async () => {
    const { result } = await run('get_meeting_receipts', { report_id: SMOKE_MEETING_REPORT_ID });
    assert.equal(result.ok, true);
    assert.equal(result.data.ui, RECEIPTS_UI);
    assert.equal(result.data.report_id, SMOKE_MEETING_REPORT_ID);
    assert.equal(result.data.public_url, null);
    assert.equal(result.data.client_facing, false);
    assert.equal(result.data.auditable, true);
    assert.equal(result.data.receipts[0].source_table, 'notes');
    assert.equal(result.data.receipts[0].firm_id, SMOKE_FIRM_ID);
  });

  it('opens a manager-gated send proposal and blocks export until confirm', async () => {
    const { result, client } = await run('propose_meeting_send', {
      report_id: SMOKE_MEETING_REPORT_ID,
      channel: 'email',
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.kind, 'meeting_send');
    assert.equal(result.data.requires_role, 'manager');
    assert.equal(result.data.status, 'pending');
    assert.equal(result.data.payload.public_url, null);
    assert.equal(result.data.payload.channel, 'email');
    assert.equal(result.data.workspace_panel.receipts_ui, RECEIPTS_UI);
    assert.equal(client.db.reports[0].status, 'draft');
    assert.equal(client.db.reports[0].sent_at, null);

    const blocked = await run(
      'export_meeting_one_pager',
      { report_id: SMOKE_MEETING_REPORT_ID },
      { session: manager, client }
    );
    assert.equal(blocked.result.ok, false);
    assert.equal(blocked.result.error.code, 'not_sent');
  });

  it('exports only after manager-confirmed send and never returns a public URL', async () => {
    const client = db();
    client.db.reports[0].status = 'published';
    client.db.reports[0].published_at = '2026-09-18T12:00:00.000Z';
    client.db.reports[0].sent_at = '2026-09-18T12:00:00.000Z';
    client.db.reports[0].send_channel = 'export';
    const { result } = await run(
      'export_meeting_one_pager',
      { report_id: SMOKE_MEETING_REPORT_ID },
      { session: manager, client }
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.public_url, null);
    assert.equal(result.data.export.audited, true);
    assert.equal(result.data.export.channel, 'export');
    assert.equal(result.audit.action, 'meeting.exported');
    assert.equal(result.data.receipts_panel.client_facing, true);
  });

  it('applies meeting_send on manager confirm and then allows export', async () => {
    const client = db();
    const proposed = await run(
      'propose_meeting_send',
      { report_id: SMOKE_MEETING_REPORT_ID, channel: 'export' },
      { session: manager, client }
    );
    assert.equal(proposed.result.ok, true);
    assert.equal(proposed.result.data.status, 'pending');
    const proposalId = proposed.result.data.id;

    const confirmed = await run(
      'confirm_proposal',
      { proposal_id: proposalId },
      { session: manager, client }
    );
    assert.equal(confirmed.result.ok, true);
    assert.notEqual(confirmed.result.data.db_status, 'failed');
    assert.ok(['applied', 'confirmed'].includes(confirmed.result.data.db_status));
    assert.equal(confirmed.result.data.status, 'confirmed');
    assert.equal(confirmed.result.data.error, null);
    assert.equal(client.db.reports[0].status, 'published');
    assert.ok(client.db.reports[0].sent_at);
    assert.equal(client.db.reports[0].send_channel, 'export');

    const exported = await run(
      'export_meeting_one_pager',
      { report_id: SMOKE_MEETING_REPORT_ID },
      { session: manager, client }
    );
    assert.equal(exported.result.ok, true);
    assert.equal(exported.result.data.public_url, null);
    assert.equal(exported.result.data.export.audited, true);
    assert.equal(exported.result.data.export.channel, 'export');
  });
});
