/**
 * CA-3.2–CA-3.5 read tools: clients, portfolios (cash/liquidity), holdings,
 * contacts, notes (audited), watchlists. Paginated lists use minimized labels.
 */
import { notFound } from './tool-error.js';
import { applyRange, asNumber, excerpt, pageResult, pagination, unwrap } from './query.js';

export const PAGE_PROPERTIES = Object.freeze({
  limit: { type: 'integer', minimum: 1, maximum: 100 },
  offset: { type: 'integer', minimum: 0 },
});

async function getOne(client, table, session, id, label) {
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('id', id)
    .eq('firm_id', session.firmId)
    .maybeSingle();
  unwrap({ data, error }, `Failed to load ${label}`);
  if (!data) {
    throw notFound(`${label} not found`);
  }
  return data;
}

function cashFields(row) {
  return {
    cash_balance: asNumber(row.cash_balance),
    cash_currency: row.cash_currency,
    liquidity_available: asNumber(row.liquidity_available),
    liquidity_buffer: asNumber(row.liquidity_buffer),
    liquidity_updated_at: row.liquidity_updated_at ?? null,
  };
}

export const READ_TOOLS = {
  list_clients: {
    description: 'List firm clients with minimized labels (paginated).',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        q: { type: 'string' },
        status: { type: 'string', enum: ['active', 'inactive'] },
        ...PAGE_PROPERTIES,
      },
    },
    audit: null,
    async handler({ session, client, args }) {
      const { limit, offset } = pagination(args);
      let q = applyRange(
        client
          .from('clients')
          .select('id, display_name, status')
          .eq('firm_id', session.firmId)
          .order('display_name', { ascending: true }),
        limit,
        offset
      );
      if (args.status) {
        q = q.eq('status', args.status);
      }
      if (args.q) {
        q = q.ilike('display_name', `%${args.q}%`);
      }
      const rows = unwrap(await q, 'Failed to list clients');
      const page = pageResult(rows ?? [], limit, offset);
      return {
        ...page,
        items: page.items.map((row) => ({
          id: row.id,
          label: row.display_name,
          status: row.status,
        })),
      };
    },
  },
  get_client: {
    description: 'Get one client in the current firm.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['client_id'],
      properties: { client_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'client.read',
      entityTable: 'clients',
      entityId: args.client_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const row = await getOne(client, 'clients', session, args.client_id, 'Client');
      return {
        id: row.id,
        display_name: row.display_name,
        legal_name: row.legal_name,
        status: row.status,
        external_ref: row.external_ref,
      };
    },
  },
  list_portfolios: {
    description: 'List portfolios with minimized labels and cash/liquidity (paginated).',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        client_id: { type: 'string' },
        ...PAGE_PROPERTIES,
      },
    },
    audit: null,
    async handler({ session, client, args }) {
      const { limit, offset } = pagination(args);
      let q = applyRange(
        client
          .from('portfolios')
          .select(
            'id, client_id, name, cash_balance, cash_currency, liquidity_available, liquidity_buffer'
          )
          .eq('firm_id', session.firmId)
          .order('name', { ascending: true }),
        limit,
        offset
      );
      if (args.client_id) {
        q = q.eq('client_id', args.client_id);
      }
      const rows = unwrap(await q, 'Failed to list portfolios');
      const page = pageResult(rows ?? [], limit, offset);
      return {
        ...page,
        items: page.items.map((row) => ({
          id: row.id,
          label: row.name,
          client_id: row.client_id,
          ...cashFields(row),
        })),
      };
    },
  },
  get_portfolio: {
    description: 'Get one portfolio including CA-1.5 cash and liquidity fields.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['portfolio_id'],
      properties: { portfolio_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'portfolio.read',
      entityTable: 'portfolios',
      entityId: args.portfolio_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const row = await getOne(client, 'portfolios', session, args.portfolio_id, 'Portfolio');
      const cash = cashFields(row);
      return {
        id: row.id,
        client_id: row.client_id,
        name: row.name,
        base_currency: row.base_currency,
        ...cash,
        cash,
      };
    },
  },
  list_holdings: {
    description: 'List holdings for a portfolio with minimized instrument labels (paginated).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['portfolio_id'],
      properties: {
        portfolio_id: { type: 'string' },
        ...PAGE_PROPERTIES,
      },
    },
    audit: ({ args }) => ({
      action: 'holdings.list',
      entityTable: 'holdings',
      entityId: args.portfolio_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const { limit, offset } = pagination(args);
      const rows = unwrap(
        await applyRange(
          client
            .from('holdings')
            .select('id, portfolio_id, instrument_id, quantity, cost_basis, as_of')
            .eq('firm_id', session.firmId)
            .eq('portfolio_id', args.portfolio_id)
            .order('id', { ascending: true }),
          limit,
          offset
        ),
        'Failed to list holdings'
      );
      const page = pageResult(rows ?? [], limit, offset);
      const instrumentIds = [...new Set(page.items.map((row) => row.instrument_id).filter(Boolean))];
      let instruments = [];
      if (instrumentIds.length > 0) {
        instruments =
          unwrap(
            await client
              .from('instruments')
              .select('id, symbol, name')
              .eq('firm_id', session.firmId)
              .in('id', instrumentIds),
            'Failed to load instruments'
          ) ?? [];
      }
      const byId = Object.fromEntries(instruments.map((row) => [row.id, row]));
      return {
        ...page,
        items: page.items.map((row) => {
          const instrument = byId[row.instrument_id];
          return {
            id: row.id,
            label: instrument?.symbol ?? row.instrument_id,
            instrument_name: instrument?.name ?? null,
            portfolio_id: row.portfolio_id,
            instrument_id: row.instrument_id,
            quantity: asNumber(row.quantity),
          };
        }),
      };
    },
  },
  get_holding: {
    description: 'Get one holding.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['holding_id'],
      properties: { holding_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'holding.read',
      entityTable: 'holdings',
      entityId: args.holding_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const row = await getOne(client, 'holdings', session, args.holding_id, 'Holding');
      const instrument = unwrap(
        await client
          .from('instruments')
          .select('id, symbol, name')
          .eq('id', row.instrument_id)
          .eq('firm_id', session.firmId)
          .maybeSingle(),
        'Failed to load instrument'
      );
      return {
        id: row.id,
        portfolio_id: row.portfolio_id,
        instrument_id: row.instrument_id,
        symbol: instrument?.symbol ?? null,
        instrument_name: instrument?.name ?? null,
        quantity: asNumber(row.quantity),
        cost_basis: asNumber(row.cost_basis),
        as_of: row.as_of,
      };
    },
  },
  get_contact: {
    description: 'Get one contact (audited high-PII read).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['contact_id'],
      properties: { contact_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'contact.read',
      entityTable: 'contacts',
      entityId: args.contact_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const row = await getOne(client, 'contacts', session, args.contact_id, 'Contact');
      return {
        id: row.id,
        client_id: row.client_id,
        full_name: row.full_name,
        email: row.email,
        phone: row.phone,
        title: row.title,
        is_primary: row.is_primary,
      };
    },
  },
  list_notes: {
    description: 'List notes for a client with excerpts only (audited, paginated).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['client_id'],
      properties: {
        client_id: { type: 'string' },
        ...PAGE_PROPERTIES,
      },
    },
    audit: ({ args }) => ({
      action: 'notes.list',
      entityTable: 'notes',
      entityId: args.client_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const { limit, offset } = pagination(args);
      const rows = unwrap(
        await applyRange(
          client
            .from('notes')
            .select('id, client_id, body, created_by, created_at')
            .eq('firm_id', session.firmId)
            .eq('client_id', args.client_id)
            .order('created_at', { ascending: false }),
          limit,
          offset
        ),
        'Failed to list notes'
      );
      const page = pageResult(rows ?? [], limit, offset);
      return {
        ...page,
        items: page.items.map((row) => ({
          id: row.id,
          label: excerpt(row.body),
          client_id: row.client_id,
          created_by: row.created_by,
          created_at: row.created_at,
        })),
      };
    },
  },
  get_note: {
    description: 'Get one note including body (audited).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['note_id'],
      properties: { note_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'note.read',
      entityTable: 'notes',
      entityId: args.note_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const row = await getOne(client, 'notes', session, args.note_id, 'Note');
      return {
        id: row.id,
        client_id: row.client_id,
        body: row.body,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    },
  },
  list_watchlists: {
    description: 'List firm watchlists with minimized labels (paginated).',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { ...PAGE_PROPERTIES },
    },
    audit: null,
    async handler({ session, client, args }) {
      const { limit, offset } = pagination(args);
      const rows = unwrap(
        await applyRange(
          client
            .from('watchlists')
            .select('id, name, created_by, updated_at')
            .eq('firm_id', session.firmId)
            .order('name', { ascending: true }),
          limit,
          offset
        ),
        'Failed to list watchlists'
      );
      const page = pageResult(rows ?? [], limit, offset);
      return {
        ...page,
        items: page.items.map((row) => ({
          id: row.id,
          label: row.name,
          created_by: row.created_by,
        })),
      };
    },
  },
  get_watchlist: {
    description: 'Get one watchlist and its items.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['watchlist_id'],
      properties: { watchlist_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'watchlist.read',
      entityTable: 'watchlists',
      entityId: args.watchlist_id,
      sensitive: false,
    }),
    async handler({ session, client, args }) {
      const row = await getOne(client, 'watchlists', session, args.watchlist_id, 'Watchlist');
      const items =
        unwrap(
          await client
            .from('watchlist_items')
            .select('id, symbol, label, note, instrument_id')
            .eq('firm_id', session.firmId)
            .eq('watchlist_id', row.id)
            .order('symbol', { ascending: true }),
          'Failed to list watchlist items'
        ) ?? [];
      return {
        id: row.id,
        name: row.name,
        created_by: row.created_by,
        items: items.map((item) => ({
          id: item.id,
          label: item.label || item.symbol,
          symbol: item.symbol,
          note: item.note,
          instrument_id: item.instrument_id,
        })),
      };
    },
  },
  list_watchlist_items: {
    description: 'List items on a watchlist (paginated, minimized labels).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['watchlist_id'],
      properties: {
        watchlist_id: { type: 'string' },
        ...PAGE_PROPERTIES,
      },
    },
    audit: null,
    async handler({ session, client, args }) {
      const { limit, offset } = pagination(args);
      const rows = unwrap(
        await applyRange(
          client
            .from('watchlist_items')
            .select('id, watchlist_id, symbol, label, instrument_id')
            .eq('firm_id', session.firmId)
            .eq('watchlist_id', args.watchlist_id)
            .order('symbol', { ascending: true }),
          limit,
          offset
        ),
        'Failed to list watchlist items'
      );
      const page = pageResult(rows ?? [], limit, offset);
      return {
        ...page,
        items: page.items.map((row) => ({
          id: row.id,
          label: row.label || row.symbol,
          symbol: row.symbol,
          watchlist_id: row.watchlist_id,
          instrument_id: row.instrument_id,
        })),
      };
    },
  },
};
