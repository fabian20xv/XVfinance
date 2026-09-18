import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dispatchTool, listToolNames } from '../src/chat/tool-router.js';
import { confirmCard, workspacePanel } from '../src/proposals/contracts.js';
import { requiresRoleForKind } from '../src/proposals/defaults.js';
import {
  SMOKE_ANALYST_ID,
  SMOKE_CLIENT_ID,
  SMOKE_FIRM_ID,
  SMOKE_INSTRUMENT_ID,
  SMOKE_MANAGER_ID,
  SMOKE_NOTE_PROPOSAL_ID,
  SMOKE_PORTFOLIO_ID,
  SMOKE_PROPOSAL_ID,
} from '../src/db/smoke-ids.js';
import { createMemoryClient } from './helpers/memory-client.js';

const env = {
  SUPABASE_URL: 'https://krcwpupbdizzjyydzaqp.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
};

const manager = {
  userId: SMOKE_MANAGER_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'manager',
};

const analyst = {
  userId: SMOKE_ANALYST_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'analyst',
};

function pendingProposals() {
  return createMemoryClient({
    proposals: [
      {
        id: SMOKE_PROPOSAL_ID,
        firm_id: SMOKE_FIRM_ID,
        kind: 'holding_changes',
        status: 'pending_confirm',
        payload: {
          portfolio_id: SMOKE_PORTFOLIO_ID,
          changes: [{ op: 'upsert', instrument_id: SMOKE_INSTRUMENT_ID, quantity: 110 }],
        },
        preview: { title: 'Holding changes', summary: 'Update SPY quantity to 110', diff: [] },
        requires_role: 'manager',
        requires_manager: true,
        created_by: SMOKE_ANALYST_ID,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        idempotency_key: 'smoke-holding-changes',
        confirmed_by: null,
        rejected_by: null,
        applied_at: null,
        error: null,
        created_at: '2026-09-18T00:00:00.000Z',
        updated_at: '2026-09-18T00:00:00.000Z',
      },
      {
        id: SMOKE_NOTE_PROPOSAL_ID,
        firm_id: SMOKE_FIRM_ID,
        kind: 'note_upsert',
        status: 'pending_confirm',
        payload: { client_id: SMOKE_CLIENT_ID, body: 'Follow-up after IPS review.' },
        preview: { title: 'Add note', summary: 'Follow-up after IPS review.' },
        requires_role: 'any_member',
        requires_manager: false,
        created_by: SMOKE_ANALYST_ID,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        idempotency_key: 'smoke-note-upsert',
        confirmed_by: null,
        rejected_by: null,
        applied_at: null,
        error: null,
        created_at: '2026-09-18T00:00:00.000Z',
        updated_at: '2026-09-18T00:00:00.000Z',
      },
    ],
  });
}

async function run(name, args, { session = manager, client = pendingProposals() } = {}) {
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

describe('CA-4 proposal pipeline + dual confirm', () => {
  it('registers propose/confirm tools on the E2 allowlist', () => {
    const names = listToolNames();
    for (const name of [
      'list_proposals',
      'get_proposal',
      'confirm_proposal',
      'reject_proposal',
      'get_proposal_confirm_card',
      'get_proposal_workspace_panel',
      'propose_holding_changes',
      'propose_client_upsert',
      'propose_contact_upsert',
      'propose_watchlist_upsert',
      'propose_note_upsert',
    ]) {
      assert.ok(names.includes(name), name);
    }
  });

  it('defaults notes to any_member and holdings/clients/contacts/watchlists to manager', () => {
    assert.equal(requiresRoleForKind('note_upsert'), 'any_member');
    assert.equal(requiresRoleForKind('holding_changes'), 'manager');
    assert.equal(requiresRoleForKind('client_upsert'), 'manager');
    assert.equal(requiresRoleForKind('contact_upsert'), 'manager');
    assert.equal(requiresRoleForKind('watchlist_upsert'), 'manager');
  });

  it('shares proposal_id between the chat confirm card and workspace panel', () => {
    const proposal = {
      id: SMOKE_PROPOSAL_ID,
      kind: 'holding_changes',
      status: 'pending_confirm',
      requires_role: 'manager',
      preview: { title: 'Holding changes', diff: [{ op: 'upsert' }] },
      payload: { portfolio_id: SMOKE_PORTFOLIO_ID },
      expires_at: '2026-09-19T00:00:00.000Z',
      idempotency_key: 'smoke-holding-changes',
    };
    const card = confirmCard(proposal);
    const panel = workspacePanel(proposal);
    assert.equal(card.ui, 'chat.confirm_card');
    assert.equal(panel.ui, 'workspace.diff_confirm_panel');
    assert.equal(card.proposal_id, SMOKE_PROPOSAL_ID);
    assert.equal(panel.proposal_id, card.proposal_id);
    assert.equal(card.status, 'pending');
    assert.equal(panel.status, 'pending');
    assert.equal(card.actions[0].path, `/v1/proposals/${SMOKE_PROPOSAL_ID}/confirm`);
    assert.equal(panel.actions[0].path, card.actions[0].path);
  });

  it('lists pending proposals with preview, expires_at, and idempotency_key', async () => {
    const { result } = await run('list_proposals', { status: 'pending', limit: 20, offset: 0 });
    assert.equal(result.ok, true);
    const holding = result.data.items.find((row) => row.id === SMOKE_PROPOSAL_ID);
    assert.ok(holding);
    assert.equal(holding.status, 'pending');
    assert.ok(holding.preview);
    assert.ok(holding.expires_at);
    assert.equal(holding.idempotency_key, 'smoke-holding-changes');
    assert.equal(holding.confirm_card.proposal_id, SMOKE_PROPOSAL_ID);
    assert.equal(holding.workspace_panel.proposal_id, SMOKE_PROPOSAL_ID);
  });

  it('opens a holding-changes proposal as pending with manager confirm', async () => {
    const { result } = await run(
      'propose_holding_changes',
      {
        portfolio_id: SMOKE_PORTFOLIO_ID,
        changes: [{ op: 'upsert', instrument_id: SMOKE_INSTRUMENT_ID, quantity: 120 }],
        idempotency_key: 'hold-120',
      },
      { client: createMemoryClient({ proposals: [] }) }
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.kind, 'holding_changes');
    assert.equal(result.data.status, 'pending');
    assert.equal(result.data.requires_role, 'manager');
    assert.equal(result.data.idempotency_key, 'hold-120');
    assert.ok(result.data.expires_at);
    assert.equal(result.data.preview.title, 'Holding changes');
    assert.equal(result.audit.action, 'proposal.submitted');
  });

  it('replays propose_* when the firm idempotency_key already exists', async () => {
    const client = pendingProposals();
    const { result } = await run(
      'propose_holding_changes',
      {
        portfolio_id: SMOKE_PORTFOLIO_ID,
        changes: [{ op: 'upsert', instrument_id: SMOKE_INSTRUMENT_ID, quantity: 999 }],
        idempotency_key: 'smoke-holding-changes',
      },
      { client }
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.idempotent_replay, true);
    assert.equal(result.data.id, SMOKE_PROPOSAL_ID);
    assert.equal(result.data.payload.changes[0].quantity, 110);
  });

  it('defaults note proposals to any_member so an analyst may confirm', async () => {
    const { result: proposed } = await run(
      'propose_note_upsert',
      { client_id: SMOKE_CLIENT_ID, body: 'Call next week.', idempotency_key: 'note-1' },
      { session: analyst, client: createMemoryClient({ proposals: [] }) }
    );
    assert.equal(proposed.ok, true);
    assert.equal(proposed.data.requires_role, 'any_member');
    assert.equal(proposed.data.requires_manager, false);

    const { result: confirmed } = await run(
      'confirm_proposal',
      { proposal_id: SMOKE_NOTE_PROPOSAL_ID },
      { session: analyst }
    );
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.data.db_status, 'confirmed');
    assert.equal(confirmed.data.confirmed_by, SMOKE_ANALYST_ID);
  });

  it('blocks an analyst from confirming a manager-gated holding proposal', async () => {
    const { result } = await run(
      'confirm_proposal',
      { proposal_id: SMOKE_PROPOSAL_ID },
      { session: analyst }
    );
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'forbidden');
  });

  it('lets a manager confirm a holding proposal (apply is the confirm UPDATE)', async () => {
    const { result } = await run('confirm_proposal', { proposal_id: SMOKE_PROPOSAL_ID });
    assert.equal(result.ok, true);
    assert.equal(result.data.confirmed_by, SMOKE_MANAGER_ID);
    assert.ok(['confirmed', 'applied'].includes(result.data.db_status));
    assert.equal(result.audit.action, 'proposal.confirmed');
  });

  it('lets a manager reject a pending proposal', async () => {
    const { result } = await run('reject_proposal', { proposal_id: SMOKE_PROPOSAL_ID });
    assert.equal(result.ok, true);
    assert.equal(result.data.status, 'rejected');
    assert.equal(result.data.rejected_by, SMOKE_MANAGER_ID);
    assert.equal(result.audit.action, 'proposal.rejected');
  });

  it('opens client, contact, and watchlist upsert proposals', async () => {
    const client = createMemoryClient({ proposals: [] });
    const clientUpsert = await run(
      'propose_client_upsert',
      { display_name: 'New Family', status: 'active' },
      { client }
    );
    assert.equal(clientUpsert.result.ok, true);
    assert.equal(clientUpsert.result.data.kind, 'client_upsert');
    assert.equal(clientUpsert.result.data.requires_role, 'manager');

    const contactUpsert = await run(
      'propose_contact_upsert',
      { client_id: SMOKE_CLIENT_ID, full_name: 'Alex Smoke' },
      { client }
    );
    assert.equal(contactUpsert.result.ok, true);
    assert.equal(contactUpsert.result.data.kind, 'contact_upsert');

    const watch = await run(
      'propose_watchlist_upsert',
      { name: 'Rates', items: [{ symbol: 'TLT' }] },
      { client }
    );
    assert.equal(watch.result.ok, true);
    assert.equal(watch.result.data.kind, 'watchlist_upsert');
    assert.equal(watch.result.data.requires_role, 'manager');
  });

  it('returns confirm-card and workspace-panel tools for the same id', async () => {
    const card = await run('get_proposal_confirm_card', { proposal_id: SMOKE_PROPOSAL_ID });
    const panel = await run('get_proposal_workspace_panel', { proposal_id: SMOKE_PROPOSAL_ID });
    assert.equal(card.result.ok, true);
    assert.equal(panel.result.ok, true);
    assert.equal(card.result.data.proposal_id, panel.result.data.proposal_id);
    assert.equal(card.result.data.ui, 'chat.confirm_card');
    assert.equal(panel.result.data.ui, 'workspace.diff_confirm_panel');
  });
});
