/**
 * CA-3.1 session context + workspace focus.
 */
import { notFound, badArgs } from './tool-error.js';
import { unwrap } from './query.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(value, name) {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw badArgs(`${name} must be a UUID`);
  }
  return value;
}

async function loadFocus(client, session) {
  const { data, error } = await client
    .from('workspace_focus')
    .select('client_id, portfolio_id, watchlist_id, updated_at')
    .eq('user_id', session.userId)
    .eq('firm_id', session.firmId)
    .maybeSingle();
  unwrap({ data, error }, 'Failed to load workspace focus');
  if (!data) {
    return null;
  }
  return {
    client_id: data.client_id,
    portfolio_id: data.portfolio_id,
    watchlist_id: data.watchlist_id,
    updated_at: data.updated_at,
  };
}

async function assertClient(client, session, clientId) {
  const { data, error } = await client
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('firm_id', session.firmId)
    .maybeSingle();
  unwrap({ data, error }, 'Failed to load client');
  if (!data) {
    throw notFound('Client not found');
  }
}

async function assertPortfolio(client, session, portfolioId, clientId) {
  const { data, error } = await client
    .from('portfolios')
    .select('id, client_id')
    .eq('id', portfolioId)
    .eq('firm_id', session.firmId)
    .maybeSingle();
  unwrap({ data, error }, 'Failed to load portfolio');
  if (!data) {
    throw notFound('Portfolio not found');
  }
  if (clientId && data.client_id !== clientId) {
    throw badArgs('portfolio_id does not belong to client_id');
  }
  return data;
}

async function assertWatchlist(client, session, watchlistId) {
  const { data, error } = await client
    .from('watchlists')
    .select('id')
    .eq('id', watchlistId)
    .eq('firm_id', session.firmId)
    .maybeSingle();
  unwrap({ data, error }, 'Failed to load watchlist');
  if (!data) {
    throw notFound('Watchlist not found');
  }
}

export const SESSION_TOOLS = {
  get_session_context: {
    description: 'Authenticated user, firm, role, and current workspace focus.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    audit: {
      action: 'session.context.read',
      entityTable: 'workspace_focus',
      sensitive: true,
    },
    async handler({ session, client }) {
      const focus = await loadFocus(client, session);
      return {
        user_id: session.userId,
        firm_id: session.firmId,
        role: session.role,
        focus,
      };
    },
  },
  set_workspace_focus: {
    description: 'Set or clear the current client / portfolio / watchlist focus.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        client_id: { type: 'string' },
        portfolio_id: { type: 'string' },
        watchlist_id: { type: 'string' },
      },
    },
    audit: {
      action: 'session.focus.write',
      entityTable: 'workspace_focus',
      sensitive: false,
    },
    async handler({ session, client, args }) {
      const clientId = optionalUuid(args.client_id, 'client_id');
      const portfolioId = optionalUuid(args.portfolio_id, 'portfolio_id');
      const watchlistId = optionalUuid(args.watchlist_id, 'watchlist_id');

      if (clientId) {
        await assertClient(client, session, clientId);
      }
      if (portfolioId) {
        await assertPortfolio(client, session, portfolioId, clientId);
      }
      if (watchlistId) {
        await assertWatchlist(client, session, watchlistId);
      }

      const patch = {
        user_id: session.userId,
        firm_id: session.firmId,
        client_id: clientId,
        portfolio_id: portfolioId,
        watchlist_id: watchlistId,
      };

      const existing = unwrap(
        await client
          .from('workspace_focus')
          .select('user_id')
          .eq('user_id', session.userId)
          .eq('firm_id', session.firmId)
          .maybeSingle(),
        'Failed to load workspace focus'
      );

      if (existing) {
        unwrap(
          await client
            .from('workspace_focus')
            .update({
              client_id: clientId,
              portfolio_id: portfolioId,
              watchlist_id: watchlistId,
            })
            .eq('user_id', session.userId)
            .eq('firm_id', session.firmId)
            .select('user_id')
            .maybeSingle(),
          'Failed to update workspace focus'
        );
      } else {
        unwrap(
          await client.from('workspace_focus').insert(patch).select('user_id').maybeSingle(),
          'Failed to save workspace focus'
        );
      }

      return {
        user_id: session.userId,
        firm_id: session.firmId,
        role: session.role,
        focus: {
          client_id: clientId,
          portfolio_id: portfolioId,
          watchlist_id: watchlistId,
        },
      };
    },
  },
};
