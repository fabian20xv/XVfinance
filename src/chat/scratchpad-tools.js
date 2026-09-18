/**
 * CA-8 Impact Scratchpad: watermarked, read-only impact vs live, promote → proposal.
 * No source-of-truth mutation until manager confirm.
 */
import { scratchpadPayload, SCRATCHPAD_WATERMARK, SCRATCHPAD_UI } from '../scratchpad/contract.js';
import { insertProposal } from './proposal-tools.js';
import { applyRange, asNumber, pageResult, pagination, unwrap } from './query.js';
import { badArgs, conflict, notFound } from './tool-error.js';

const PAGE_PROPERTIES = {
  limit: { type: 'integer', minimum: 1, maximum: 100 },
  offset: { type: 'integer', minimum: 0 },
};

function holdingKey(row) {
  if (row?.instrument_id) {
    return `id:${row.instrument_id}`;
  }
  return `sym:${String(row?.symbol ?? '').toUpperCase()}`;
}

function scenarioHoldings(scenario) {
  const list = scenario?.holdings;
  return Array.isArray(list) ? list : [];
}

async function loadScratchpad(client, session, scratchpadId) {
  const { data, error } = await client
    .from('scratchpads')
    .select('*')
    .eq('id', scratchpadId)
    .eq('firm_id', session.firmId)
    .maybeSingle();
  unwrap({ data, error }, 'Failed to load scratchpad');
  if (!data) {
    throw notFound('Scratchpad not found');
  }
  return data;
}

async function loadLiveHoldings(client, session, portfolioId) {
  const holdings =
    unwrap(
      await client
        .from('holdings')
        .select('id, instrument_id, quantity, cost_basis, as_of')
        .eq('firm_id', session.firmId)
        .eq('portfolio_id', portfolioId),
      'Failed to list live holdings'
    ) ?? [];
  const instruments =
    unwrap(
      await client.from('instruments').select('id, symbol, name').eq('firm_id', session.firmId),
      'Failed to list instruments'
    ) ?? [];
  const byId = new Map(instruments.map((row) => [row.id, row]));
  return holdings.map((row) => ({
    holding_id: row.id,
    instrument_id: row.instrument_id,
    symbol: byId.get(row.instrument_id)?.symbol ?? null,
    name: byId.get(row.instrument_id)?.name ?? null,
    quantity: asNumber(row.quantity),
    cost_basis: asNumber(row.cost_basis),
    as_of: row.as_of ?? null,
  }));
}

function buildImpact(liveRows, scenarioRows) {
  const liveMap = new Map(liveRows.map((row) => [holdingKey(row), row]));
  const scenarioMap = new Map(scenarioRows.map((row) => [holdingKey(row), row]));
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const [key, proposed] of scenarioMap) {
    const live = liveMap.get(key);
    if (!live) {
      added.push(proposed);
      continue;
    }
    if (Number(live.quantity) !== Number(proposed.quantity)) {
      changed.push({
        symbol: proposed.symbol ?? live.symbol,
        instrument_id: proposed.instrument_id ?? live.instrument_id,
        from_quantity: live.quantity,
        to_quantity: proposed.quantity,
      });
    } else {
      unchanged.push(proposed);
    }
  }
  for (const [key, live] of liveMap) {
    if (!scenarioMap.has(key)) {
      removed.push(live);
    }
  }
  return { added, removed, changed, unchanged };
}

function promoteChanges(liveRows, scenarioRows, { replace_missing = false } = {}) {
  const changes = scenarioRows.map((row) => ({
    op: 'upsert',
    instrument_id: row.instrument_id,
    symbol: row.symbol,
    quantity: row.quantity,
    ...(row.cost_basis != null ? { cost_basis: row.cost_basis } : {}),
    ...(row.as_of ? { as_of: row.as_of } : {}),
  }));
  if (replace_missing) {
    const scenarioKeys = new Set(scenarioRows.map(holdingKey));
    for (const live of liveRows) {
      if (!scenarioKeys.has(holdingKey(live))) {
        changes.push({
          op: 'delete',
          holding_id: live.holding_id,
          instrument_id: live.instrument_id,
          symbol: live.symbol,
        });
      }
    }
  }
  return changes;
}

export const SCRATCHPAD_TOOLS = {
  list_scratchpads: {
    description: 'List watermarked impact scratchpads (not live / not source of truth).',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        portfolio_id: { type: 'string' },
        ...PAGE_PROPERTIES,
      },
    },
    audit: {
      action: 'scratchpad.list',
      entityTable: 'scratchpads',
      sensitive: false,
    },
    async handler({ session, client, args }) {
      const { limit, offset } = pagination(args);
      let q = client
        .from('scratchpads')
        .select('*')
        .eq('firm_id', session.firmId)
        .order('updated_at', { ascending: false });
      if (args.portfolio_id) {
        q = q.eq('portfolio_id', args.portfolio_id);
      }
      const rows = unwrap(await applyRange(q, limit, offset), 'Failed to list scratchpads') ?? [];
      const page = pageResult(rows, limit, offset);
      return {
        ...page,
        watermark: SCRATCHPAD_WATERMARK,
        source_of_truth: false,
        items: page.items.map((row) => scratchpadPayload(row)),
      };
    },
  },
  get_scratchpad: {
    description: 'Get a watermarked scratchpad. Never live source of truth.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['scratchpad_id'],
      properties: { scratchpad_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'scratchpad.read',
      entityTable: 'scratchpads',
      entityId: args.scratchpad_id,
      sensitive: false,
    }),
    async handler({ session, client, args }) {
      const row = await loadScratchpad(client, session, args.scratchpad_id);
      return scratchpadPayload(row);
    },
  },
  create_scratchpad: {
    description: 'Create a watermarked impact scratchpad (not live).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['portfolio_id', 'name'],
      properties: {
        portfolio_id: { type: 'string' },
        name: { type: 'string' },
        scenario: { type: 'object' },
      },
    },
    audit: ({ data }) => ({
      action: 'scratchpad.created',
      entityTable: 'scratchpads',
      entityId: data?.id,
      sensitive: false,
    }),
    async handler({ session, client, args }) {
      const name = String(args.name ?? '').trim();
      if (!name) {
        throw badArgs('name is required');
      }
      const scenario = args.scenario && typeof args.scenario === 'object' ? args.scenario : {};
      const row = {
        firm_id: session.firmId,
        portfolio_id: args.portfolio_id,
        created_by: session.userId,
        name,
        scenario,
        watermark: SCRATCHPAD_WATERMARK,
      };
      const { data, error } = await client.from('scratchpads').insert(row).select('*').single();
      unwrap({ data, error }, 'Failed to create scratchpad');
      return scratchpadPayload(data);
    },
  },
  update_scratchpad: {
    description: 'Update a watermarked scratchpad scenario (not live).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['scratchpad_id'],
      properties: {
        scratchpad_id: { type: 'string' },
        name: { type: 'string' },
        scenario: { type: 'object' },
      },
    },
    audit: ({ args }) => ({
      action: 'scratchpad.updated',
      entityTable: 'scratchpads',
      entityId: args.scratchpad_id,
      sensitive: false,
    }),
    async handler({ session, client, args }) {
      const existing = await loadScratchpad(client, session, args.scratchpad_id);
      const patch = {
        watermark: SCRATCHPAD_WATERMARK,
      };
      if (args.name != null) {
        patch.name = String(args.name).trim();
      }
      if (args.scenario != null) {
        patch.scenario = args.scenario;
      }
      const { data, error } = await client
        .from('scratchpads')
        .update(patch)
        .eq('id', existing.id)
        .eq('firm_id', session.firmId)
        .select('*')
        .maybeSingle();
      unwrap({ data, error }, 'Failed to update scratchpad');
      if (!data) {
        throw conflict('Scratchpad update was not applied', 'conflict');
      }
      return scratchpadPayload(data);
    },
  },
  get_scratchpad_impact: {
    description:
      'Read-only impact of a watermarked scratchpad versus live holdings. Does not mutate source of truth.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['scratchpad_id'],
      properties: { scratchpad_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'scratchpad.impact',
      entityTable: 'scratchpads',
      entityId: args.scratchpad_id,
      sensitive: false,
    }),
    async handler({ session, client, args }) {
      const row = await loadScratchpad(client, session, args.scratchpad_id);
      const live = await loadLiveHoldings(client, session, row.portfolio_id);
      const scenario = scenarioHoldings(row.scenario);
      const impact = buildImpact(live, scenario);
      return scratchpadPayload(row, {
        ui: SCRATCHPAD_UI,
        live_holdings: live,
        scenario_holdings: scenario,
        impact,
        source_of_truth: false,
        read_only: true,
      });
    },
  },
  promote_scratchpad: {
    description:
      'Open a scratchpad_promote proposal (manager confirm). Holdings are not mutated until confirm.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['scratchpad_id'],
      properties: {
        scratchpad_id: { type: 'string' },
        replace_missing: { type: 'boolean' },
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
      const row = await loadScratchpad(client, session, args.scratchpad_id);
      const scenario = scenarioHoldings(row.scenario);
      if (scenario.length === 0) {
        throw badArgs('scratchpad scenario has no holdings to promote');
      }
      const live = await loadLiveHoldings(client, session, row.portfolio_id);
      const changes = promoteChanges(live, scenario, {
        replace_missing: Boolean(args.replace_missing),
      });
      return insertProposal(client, session, {
        kind: 'scratchpad_promote',
        payload: {
          scratchpad_id: row.id,
          portfolio_id: row.portfolio_id,
          watermark: SCRATCHPAD_WATERMARK,
          source_of_truth: false,
          changes,
        },
        idempotency_key: args.idempotency_key,
        expires_at: args.expires_at,
      });
    },
  },
};
