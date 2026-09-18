/**
 * CA-4 proposal pipeline tools: list/get, propose_*, confirm/reject, UI contracts.
 * Writes go through user-JWT + RLS; apply runs in the confirm UPDATE trigger.
 */
import { confirmCard, publicProposal, workspacePanel } from '../proposals/contracts.js';
import {
  apiStatus,
  dbStatusesForApi,
  requiresRoleForKind,
  roleCanConfirm,
} from '../proposals/defaults.js';
import { buildPreview } from '../proposals/preview.js';
import { hasUnmatchedSymbols, unmatchedMessage, unmatchedSymbols } from '../proposals/unmatched.js';
import { applyRange, pageResult, pagination, unwrap } from './query.js';
import { badArgs, conflict, forbidden, notFound } from './tool-error.js';

const CHANGE_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['op'],
  properties: {
    op: { type: 'string', enum: ['upsert', 'delete'] },
    holding_id: { type: 'string' },
    instrument_id: { type: 'string' },
    symbol: { type: 'string' },
    name: { type: 'string' },
    quantity: { type: 'number' },
    cost_basis: { type: 'number' },
    as_of: { type: 'string' },
  },
};

const WATCHLIST_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['symbol'],
  properties: {
    symbol: { type: 'string' },
    instrument_id: { type: 'string' },
    label: { type: 'string' },
    note: { type: 'string' },
  },
};

const PAGE_PROPERTIES = {
  limit: { type: 'integer', minimum: 1, maximum: 100 },
  offset: { type: 'integer', minimum: 0 },
};

function defaultExpiresAt(expiresAt) {
  if (expiresAt) {
    return expiresAt;
  }
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

async function loadProposal(client, session, proposalId) {
  const { data, error } = await client
    .from('proposals')
    .select('*')
    .eq('id', proposalId)
    .eq('firm_id', session.firmId)
    .maybeSingle();
  unwrap({ data, error }, 'Failed to load proposal');
  if (!data) {
    throw notFound('Proposal not found');
  }
  return data;
}

async function persistExpired(client, session, proposal) {
  if (proposal.status !== 'pending_confirm') {
    return proposal;
  }
  const { data } = await client
    .from('proposals')
    .update({ status: 'expired', error: 'proposal expired' })
    .eq('id', proposal.id)
    .eq('firm_id', session.firmId)
    .eq('status', 'pending_confirm')
    .select('*')
    .maybeSingle();
  return data ?? { ...proposal, status: 'expired', error: proposal.error ?? 'proposal expired' };
}

function assertPending(proposal) {
  const status = apiStatus(proposal);
  if (status === 'expired') {
    throw conflict('Proposal has expired', 'expired');
  }
  if (proposal.status !== 'pending_confirm') {
    throw conflict(`Proposal is ${status}`, 'conflict');
  }
}

function assertRole(session, proposal, verb) {
  const requires = proposal.requires_role === 'any_member' ? 'any_member' : 'manager';
  if (!roleCanConfirm(session.role, requires)) {
    throw forbidden(`Manager role required to ${verb} this proposal`, 'forbidden');
  }
}

async function findByIdempotency(client, session, key) {
  if (!key) {
    return null;
  }
  const { data, error } = await client
    .from('proposals')
    .select('*')
    .eq('firm_id', session.firmId)
    .eq('idempotency_key', key)
    .maybeSingle();
  unwrap({ data, error }, 'Failed to look up idempotency key');
  return data;
}

export async function insertProposal(client, session, { kind, payload, idempotency_key, expires_at }) {
  const existing = await findByIdempotency(client, session, idempotency_key);
  if (existing) {
    return { ...publicProposal(existing), idempotent_replay: true };
  }

  const requiresRole = requiresRoleForKind(kind);
  const row = {
    firm_id: session.firmId,
    kind,
    status: 'pending_confirm',
    payload,
    preview: buildPreview(kind, payload),
    requires_role: requiresRole,
    requires_manager: requiresRole === 'manager',
    created_by: session.userId,
    expires_at: defaultExpiresAt(expires_at),
    idempotency_key: idempotency_key ?? null,
  };

  const { data, error } = await client.from('proposals').insert(row).select('*').single();
  if (error?.code === '23505' && idempotency_key) {
    const replay = await findByIdempotency(client, session, idempotency_key);
    if (replay) {
      return { ...publicProposal(replay), idempotent_replay: true };
    }
  }
  unwrap({ data, error }, 'Failed to create proposal');
  return { ...publicProposal(data), idempotent_replay: false };
}

export const PROPOSAL_TOOLS = {
  list_proposals: {
    description: 'List firm proposals (pending/confirmed/rejected/expired).',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'confirmed', 'rejected', 'expired', 'failed', 'draft'],
        },
        kind: { type: 'string' },
        ...PAGE_PROPERTIES,
      },
    },
    audit: {
      action: 'proposals.list',
      entityTable: 'proposals',
      sensitive: false,
    },
    async handler({ session, client, args }) {
      const { limit, offset } = pagination(args);
      let q = client
        .from('proposals')
        .select('*')
        .eq('firm_id', session.firmId)
        .order('created_at', { ascending: false });
      const dbStatuses = args.status ? dbStatusesForApi(args.status) : null;
      if (dbStatuses) {
        q = q.in('status', dbStatuses);
      }
      if (args.kind) {
        q = q.eq('kind', args.kind);
      }
      const rows = unwrap(await applyRange(q, limit, offset), 'Failed to list proposals') ?? [];
      const mapped = rows
        .map((row) => publicProposal(row))
        .filter((row) => !args.status || row.status === args.status);
      const page = pageResult(mapped, limit, offset);
      return page;
    },
  },
  get_proposal: {
    description: 'Get one proposal including preview and dual-confirm contracts.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['proposal_id'],
      properties: { proposal_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'proposal.read',
      entityTable: 'proposals',
      entityId: args.proposal_id,
      sensitive: false,
    }),
    async handler({ session, client, args }) {
      let row = await loadProposal(client, session, args.proposal_id);
      if (apiStatus(row) === 'expired' && row.status === 'pending_confirm') {
        row = await persistExpired(client, session, row);
      }
      return publicProposal(row);
    },
  },
  get_proposal_confirm_card: {
    description: 'Chat inline confirm-card payload for a proposal.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['proposal_id'],
      properties: { proposal_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'proposal.confirm_card',
      entityTable: 'proposals',
      entityId: args.proposal_id,
      sensitive: false,
    }),
    async handler({ session, client, args }) {
      const row = await loadProposal(client, session, args.proposal_id);
      return confirmCard(row);
    },
  },
  get_proposal_workspace_panel: {
    description: 'Workspace diff/confirm panel payload (same proposal_id as the chat card).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['proposal_id'],
      properties: { proposal_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'proposal.workspace_panel',
      entityTable: 'proposals',
      entityId: args.proposal_id,
      sensitive: false,
    }),
    async handler({ session, client, args }) {
      const row = await loadProposal(client, session, args.proposal_id);
      return workspacePanel(row);
    },
  },
  confirm_proposal: {
    description: 'Confirm a pending proposal; apply runs as the confirming user.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['proposal_id'],
      properties: { proposal_id: { type: 'string' } },
    },
    audit: ({ args, data }) => ({
      action: data?.db_status === 'applied' ? 'proposal.applied' : 'proposal.confirmed',
      entityTable: 'proposals',
      entityId: args.proposal_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const row = await loadProposal(client, session, args.proposal_id);
      if (apiStatus(row) === 'expired') {
        await persistExpired(client, session, row);
        throw conflict('Proposal has expired', 'expired');
      }
      assertPending(row);
      assertRole(session, row, 'confirm');
      if (row.kind === 'holdings_import' && hasUnmatchedSymbols(row.payload)) {
        throw conflict(unmatchedMessage(unmatchedSymbols(row.payload)), 'unmatched_symbols');
      }
      const { data, error } = await client
        .from('proposals')
        .update({
          status: 'confirmed',
          confirmed_by: session.userId,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('firm_id', session.firmId)
        .eq('status', 'pending_confirm')
        .select('*')
        .maybeSingle();
      if (error) {
        if (/unmatched symbols/i.test(error.message ?? '')) {
          throw conflict(error.message, 'unmatched_symbols');
        }
        throw forbidden(error.message, 'forbidden');
      }
      if (!data) {
        throw forbidden('Confirm was not applied (role or status gate).', 'forbidden');
      }
      if (data.status === 'expired') {
        throw conflict('Proposal has expired', 'expired');
      }
      return publicProposal(data);
    },
  },
  reject_proposal: {
    description: 'Reject a pending proposal (same role gate as confirm).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['proposal_id'],
      properties: { proposal_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'proposal.rejected',
      entityTable: 'proposals',
      entityId: args.proposal_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const row = await loadProposal(client, session, args.proposal_id);
      if (apiStatus(row) === 'expired') {
        await persistExpired(client, session, row);
        throw conflict('Proposal has expired', 'expired');
      }
      assertPending(row);
      assertRole(session, row, 'reject');
      const { data, error } = await client
        .from('proposals')
        .update({
          status: 'rejected',
          rejected_by: session.userId,
          rejected_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('firm_id', session.firmId)
        .eq('status', 'pending_confirm')
        .select('*')
        .maybeSingle();
      if (error) {
        throw forbidden(error.message, 'forbidden');
      }
      if (!data) {
        throw forbidden('Reject was not applied (role or status gate).', 'forbidden');
      }
      return publicProposal(data);
    },
  },
  propose_holding_changes: {
    description: 'Open a pending holding-changes proposal (manager confirm).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['portfolio_id', 'changes'],
      properties: {
        portfolio_id: { type: 'string' },
        changes: { type: 'array', items: CHANGE_ITEM },
        idempotency_key: { type: 'string' },
        expires_at: { type: 'string' },
      },
    },
    audit: ({ data }) => ({
      action: 'proposal.submitted',
      entityTable: 'proposals',
      entityId: data?.id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      if (!Array.isArray(args.changes) || args.changes.length === 0) {
        throw badArgs('changes must be a non-empty array');
      }
      for (const change of args.changes) {
        if (change.op === 'upsert' && change.quantity == null) {
          throw badArgs('holding upsert requires quantity');
        }
        if (change.op === 'upsert' && !change.instrument_id && !change.symbol) {
          throw badArgs('holding upsert requires instrument_id or symbol');
        }
        if (change.op === 'delete' && !change.holding_id && !change.instrument_id) {
          throw badArgs('holding delete requires holding_id or instrument_id');
        }
      }
      return insertProposal(client, session, {
        kind: 'holding_changes',
        payload: { portfolio_id: args.portfolio_id, changes: args.changes },
        idempotency_key: args.idempotency_key,
        expires_at: args.expires_at,
      });
    },
  },
  propose_client_upsert: {
    description: 'Open a pending client create/update proposal (manager confirm).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['display_name'],
      properties: {
        id: { type: 'string' },
        display_name: { type: 'string' },
        legal_name: { type: 'string' },
        status: { type: 'string', enum: ['active', 'inactive'] },
        external_ref: { type: 'string' },
        idempotency_key: { type: 'string' },
        expires_at: { type: 'string' },
      },
    },
    audit: ({ data }) => ({
      action: 'proposal.submitted',
      entityTable: 'proposals',
      entityId: data?.id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const { idempotency_key, expires_at, ...payload } = args;
      return insertProposal(client, session, {
        kind: 'client_upsert',
        payload,
        idempotency_key,
        expires_at,
      });
    },
  },
  propose_contact_upsert: {
    description: 'Open a pending contact create/update proposal (manager confirm).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['client_id', 'full_name'],
      properties: {
        id: { type: 'string' },
        client_id: { type: 'string' },
        full_name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        title: { type: 'string' },
        is_primary: { type: 'boolean' },
        idempotency_key: { type: 'string' },
        expires_at: { type: 'string' },
      },
    },
    audit: ({ data }) => ({
      action: 'proposal.submitted',
      entityTable: 'proposals',
      entityId: data?.id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const { idempotency_key, expires_at, ...payload } = args;
      return insertProposal(client, session, {
        kind: 'contact_upsert',
        payload,
        idempotency_key,
        expires_at,
      });
    },
  },
  propose_watchlist_upsert: {
    description: 'Open a pending watchlist upsert proposal (manager confirm).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        items: { type: 'array', items: WATCHLIST_ITEM },
        replace_items: { type: 'boolean' },
        idempotency_key: { type: 'string' },
        expires_at: { type: 'string' },
      },
    },
    audit: ({ data }) => ({
      action: 'proposal.submitted',
      entityTable: 'proposals',
      entityId: data?.id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const { idempotency_key, expires_at, ...payload } = args;
      return insertProposal(client, session, {
        kind: 'watchlist_upsert',
        payload,
        idempotency_key,
        expires_at,
      });
    },
  },
  propose_note_upsert: {
    description: 'Open a pending note proposal. Confirm default any_member (analyst or manager).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['client_id', 'body'],
      properties: {
        id: { type: 'string' },
        client_id: { type: 'string' },
        body: { type: 'string' },
        idempotency_key: { type: 'string' },
        expires_at: { type: 'string' },
      },
    },
    audit: ({ data }) => ({
      action: 'proposal.submitted',
      entityTable: 'proposals',
      entityId: data?.id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const { idempotency_key, expires_at, ...payload } = args;
      return insertProposal(client, session, {
        kind: 'note_upsert',
        payload,
        idempotency_key,
        expires_at,
      });
    },
  },
};
