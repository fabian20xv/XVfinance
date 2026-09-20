/**
 * Tess QA fixture seed — develop Supabase project only.
 *
 * Service-role stays on this server path. Never import from chat tools or clients.
 * App runtime `boot()` is unchanged (parent still allowed for product).
 */
import {
  DEVELOP_SUPABASE_PROJECT,
  DEVELOP_SUPABASE_PROJECT_REF,
  PARENT_SUPABASE_PROJECT,
  PARENT_SUPABASE_PROJECT_REF,
  assertTessDevelopSupabaseUrl,
} from '../config/supabase-lock.js';
import { isProductionEnv } from '../config/runtime-env.js';
import {
  TESS_ALPHA_AAPL_ID,
  TESS_ALPHA_ANALYST_ID,
  TESS_ALPHA_AUDIT_B_ID,
  TESS_ALPHA_AUDIT_ID,
  TESS_ALPHA_CLIENT_B_ID,
  TESS_ALPHA_CLIENT_ID,
  TESS_ALPHA_CONTACT_B_ID,
  TESS_ALPHA_CONTACT_ID,
  TESS_ALPHA_FIRM_ID,
  TESS_ALPHA_FIRM_NAME,
  TESS_ALPHA_HOLDING_AAPL_ID,
  TESS_ALPHA_HOLDING_SPY_ID,
  TESS_ALPHA_MANAGER_ID,
  TESS_ALPHA_NOTE_B_ID,
  TESS_ALPHA_NOTE_ID,
  TESS_ALPHA_PORTFOLIO_B_ID,
  TESS_ALPHA_PORTFOLIO_ID,
  TESS_ALPHA_PROPOSAL_ID,
  TESS_ALPHA_REPORT_ID,
  TESS_ALPHA_SCRATCHPAD_ID,
  TESS_ALPHA_SPY_ID,
  TESS_ALPHA_WATCHLIST_ID,
  TESS_ALPHA_WATCHLIST_ITEM_ID,
  TESS_BETA_ANALYST_ID,
  TESS_BETA_AUDIT_ID,
  TESS_BETA_CLIENT_ID,
  TESS_BETA_CONTACT_ID,
  TESS_BETA_FIRM_ID,
  TESS_BETA_FIRM_NAME,
  TESS_BETA_HOLDING_ID,
  TESS_BETA_MANAGER_ID,
  TESS_BETA_NOTE_ID,
  TESS_BETA_PORTFOLIO_ID,
  TESS_BETA_SPY_ID,
  TESS_BETA_WATCHLIST_ID,
  TESS_BETA_WATCHLIST_ITEM_ID,
  TESS_QA_DEFAULT_PASSWORD,
  TESS_SCHEMA_TABLES,
  TESS_TOP_10_JOBS,
  TESS_USERS,
} from '../db/tess-ids.js';
import { createServiceRoleClient } from './service-role.js';

const SCHEMA_BEHIND_RE =
  /schema cache|does not exist|relation .* does not exist|could not find the table/i;

function tessQaPassword(env) {
  const override = typeof env.TESS_QA_PASSWORD === 'string' ? env.TESS_QA_PASSWORD.trim() : '';
  return override || TESS_QA_DEFAULT_PASSWORD;
}

/**
 * Fail loud unless env points at develop (never parent) and is not production.
 * @param {NodeJS.ProcessEnv} env
 */
export function assertTessDevelopTarget(env = process.env) {
  if (!env.SUPABASE_URL) {
    throw new Error(
      'SUPABASE_URL is required for Tess develop seed. ' +
        `Set it to exactly ${DEVELOP_SUPABASE_PROJECT.url} (ref ${DEVELOP_SUPABASE_PROJECT_REF}). ` +
        `Parent ${PARENT_SUPABASE_PROJECT.url} (ref ${PARENT_SUPABASE_PROJECT_REF}) is forbidden.`
    );
  }

  const locked = assertTessDevelopSupabaseUrl(env.SUPABASE_URL);

  if (isProductionEnv(env)) {
    throw new Error(
      'Refused Tess QA seed because APP_ENV/VERCEL_ENV is production. ' +
        `Tess fixtures may only be written to develop ref ${DEVELOP_SUPABASE_PROJECT_REF}.`
    );
  }

  return locked;
}

/**
 * Serializable fixture inventory (no secrets besides the documented QA password flag).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function buildTessFixtureInventory(env = process.env) {
  const passwordConfigured = Boolean(
    (typeof env.TESS_QA_PASSWORD === 'string' && env.TESS_QA_PASSWORD.trim()) ||
      TESS_QA_DEFAULT_PASSWORD
  );

  return {
    project_ref: DEVELOP_SUPABASE_PROJECT_REF,
    project_url: DEVELOP_SUPABASE_PROJECT.url,
    forbidden_parent_ref: PARENT_SUPABASE_PROJECT_REF,
    forbidden_parent_url: PARENT_SUPABASE_PROJECT.url,
    tenants: [
      {
        id: TESS_ALPHA_FIRM_ID,
        name: TESS_ALPHA_FIRM_NAME,
        label: 'Tess Alpha',
        privileged_writer: 'manager',
        restricted_writer: 'analyst',
      },
      {
        id: TESS_BETA_FIRM_ID,
        name: TESS_BETA_FIRM_NAME,
        label: 'Tess Beta',
        privileged_writer: 'manager',
        restricted_writer: 'analyst',
      },
    ],
    users: TESS_USERS.map((user) => ({
      id: user.id,
      email: user.email,
      firm_id: user.firm_id,
      firm_label: user.firm_label,
      role: user.role,
      writer: user.writer,
      platform_admin: false,
      firm_member: true,
    })),
    qa_password_configured: passwordConfigured,
    domain: {
      clients: [TESS_ALPHA_CLIENT_ID, TESS_ALPHA_CLIENT_B_ID, TESS_BETA_CLIENT_ID],
      contacts: [TESS_ALPHA_CONTACT_ID, TESS_ALPHA_CONTACT_B_ID, TESS_BETA_CONTACT_ID],
      portfolios: [TESS_ALPHA_PORTFOLIO_ID, TESS_ALPHA_PORTFOLIO_B_ID, TESS_BETA_PORTFOLIO_ID],
      portfolios_with_cash_liquidity: [
        TESS_ALPHA_PORTFOLIO_ID,
        TESS_ALPHA_PORTFOLIO_B_ID,
        TESS_BETA_PORTFOLIO_ID,
      ],
      instruments: [TESS_ALPHA_SPY_ID, TESS_ALPHA_AAPL_ID, TESS_BETA_SPY_ID],
      holdings: [TESS_ALPHA_HOLDING_SPY_ID, TESS_ALPHA_HOLDING_AAPL_ID, TESS_BETA_HOLDING_ID],
      notes: [TESS_ALPHA_NOTE_ID, TESS_ALPHA_NOTE_B_ID, TESS_BETA_NOTE_ID],
      watchlists: [TESS_ALPHA_WATCHLIST_ID, TESS_BETA_WATCHLIST_ID],
      pending_proposal_id: TESS_ALPHA_PROPOSAL_ID,
      draft_report_id: TESS_ALPHA_REPORT_ID,
      audit_events: [TESS_ALPHA_AUDIT_ID, TESS_ALPHA_AUDIT_B_ID, TESS_BETA_AUDIT_ID],
      scratchpad_id: TESS_ALPHA_SCRATCHPAD_ID,
    },
    top_10_jobs: TESS_TOP_10_JOBS,
    schema_tables: TESS_SCHEMA_TABLES,
  };
}

function failWrite(table, error) {
  const message = error?.message || String(error);
  if (SCHEMA_BEHIND_RE.test(message)) {
    throw new Error(
      `Develop schema is behind main (${table}: ${message}). ` +
        `Apply supabase/migrations (E1–E9) to develop ref ${DEVELOP_SUPABASE_PROJECT_REF} ` +
        `before npm run seed:tess. Do not write Tess fixtures to parent ` +
        `${PARENT_SUPABASE_PROJECT_REF}.`
    );
  }
  throw new Error(`Tess seed upsert failed on ${table}: ${message}`);
}

async function upsertRows(client, table, rows, onConflict = 'id') {
  const { data, error } = await client.from(table).upsert(rows, { onConflict }).select();
  if (error) {
    failWrite(table, error);
  }
  return data;
}

async function assertDevelopSchema(client) {
  const { error } = await client.from('firms').select('id').limit(1);
  if (error) {
    failWrite('firms', error);
  }

  const { error: reportError } = await client.from('reports').select('id, purpose').limit(1);
  if (reportError) {
    failWrite('reports', reportError);
  }

  const { error: auditError } = await client.from('audit_events').select('id').limit(1);
  if (auditError) {
    failWrite('audit_events', auditError);
  }
}

function isUserNotFound(error) {
  if (!error) {
    return true;
  }
  const status = error.status ?? error.statusCode;
  if (status === 404) {
    return true;
  }
  return /not found|user not found/i.test(String(error.message || ''));
}

async function upsertAuthUser(client, user) {
  if (!client?.auth?.admin) {
    throw new Error('Tess seed requires supabase.auth.admin (service-role) to create firm users.');
  }

  const { data: existing, error: getError } = await client.auth.admin.getUserById(user.id);
  if (getError && !isUserNotFound(getError)) {
    throw new Error(`Tess auth lookup failed for ${user.email}: ${getError.message}`);
  }

  const attrs = {
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      tess_label: user.firm_label,
      tess_writer: user.writer,
      display_name: user.email,
    },
    app_metadata: {
      provider: 'email',
      providers: ['email'],
      xvfinance_platform_admin: false,
      tess_firm_role: user.role,
    },
  };

  if (existing?.user) {
    const { error } = await client.auth.admin.updateUserById(user.id, attrs);
    if (error) {
      throw new Error(`Tess auth update failed for ${user.email}: ${error.message}`);
    }
    return;
  }

  const { error } = await client.auth.admin.createUser({
    id: user.id,
    ...attrs,
  });
  if (error) {
    throw new Error(`Tess auth create failed for ${user.email}: ${error.message}`);
  }
}

async function seedDomain(client, actorIds) {
  const now = new Date().toISOString();
  const asOf = now.slice(0, 10);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await upsertRows(client, 'firms', [
    { id: TESS_ALPHA_FIRM_ID, name: TESS_ALPHA_FIRM_NAME },
    { id: TESS_BETA_FIRM_ID, name: TESS_BETA_FIRM_NAME },
  ]);

  await upsertRows(
    client,
    'firm_members',
    [
      { firm_id: TESS_ALPHA_FIRM_ID, user_id: TESS_ALPHA_MANAGER_ID, role: 'manager' },
      { firm_id: TESS_ALPHA_FIRM_ID, user_id: TESS_ALPHA_ANALYST_ID, role: 'analyst' },
      { firm_id: TESS_BETA_FIRM_ID, user_id: TESS_BETA_MANAGER_ID, role: 'manager' },
      { firm_id: TESS_BETA_FIRM_ID, user_id: TESS_BETA_ANALYST_ID, role: 'analyst' },
    ],
    'firm_id,user_id'
  );

  await upsertRows(client, 'clients', [
    {
      id: TESS_ALPHA_CLIENT_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      display_name: 'Tess Alpha Family Office',
      legal_name: 'Tess Alpha Family Office LLC',
      status: 'active',
      external_ref: 'tess-alpha-family',
    },
    {
      id: TESS_ALPHA_CLIENT_B_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      display_name: 'Tess Alpha Endowment',
      legal_name: 'Tess Alpha Endowment Trust',
      status: 'active',
      external_ref: 'tess-alpha-endowment',
    },
    {
      id: TESS_BETA_CLIENT_ID,
      firm_id: TESS_BETA_FIRM_ID,
      display_name: 'Tess Beta Household',
      legal_name: 'Tess Beta Household',
      status: 'active',
      external_ref: 'tess-beta-household',
    },
  ]);

  await upsertRows(client, 'contacts', [
    {
      id: TESS_ALPHA_CONTACT_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      client_id: TESS_ALPHA_CLIENT_ID,
      full_name: 'Avery Tess',
      email: 'avery.tess@xvfinance.invalid',
      title: 'Principal',
      is_primary: true,
    },
    {
      id: TESS_ALPHA_CONTACT_B_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      client_id: TESS_ALPHA_CLIENT_B_ID,
      full_name: 'Blair Tess',
      email: 'blair.tess@xvfinance.invalid',
      title: 'Trustee',
      is_primary: true,
    },
    {
      id: TESS_BETA_CONTACT_ID,
      firm_id: TESS_BETA_FIRM_ID,
      client_id: TESS_BETA_CLIENT_ID,
      full_name: 'Casey Tess',
      email: 'casey.tess@xvfinance.invalid',
      title: 'Client',
      is_primary: true,
    },
  ]);

  await upsertRows(client, 'portfolios', [
    {
      id: TESS_ALPHA_PORTFOLIO_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      client_id: TESS_ALPHA_CLIENT_ID,
      name: 'Tess Alpha Balanced',
      base_currency: 'USD',
      cash_balance: 350000.0,
      cash_currency: 'USD',
      liquidity_available: 275000.0,
      liquidity_buffer: 75000.0,
      liquidity_updated_at: now,
    },
    {
      id: TESS_ALPHA_PORTFOLIO_B_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      client_id: TESS_ALPHA_CLIENT_B_ID,
      name: 'Tess Alpha Endowment Core',
      base_currency: 'USD',
      cash_balance: 1200000.0,
      cash_currency: 'USD',
      liquidity_available: 900000.0,
      liquidity_buffer: 150000.0,
      liquidity_updated_at: now,
    },
    {
      id: TESS_BETA_PORTFOLIO_ID,
      firm_id: TESS_BETA_FIRM_ID,
      client_id: TESS_BETA_CLIENT_ID,
      name: 'Tess Beta Taxable',
      base_currency: 'USD',
      cash_balance: 42000.0,
      cash_currency: 'USD',
      liquidity_available: 30000.0,
      liquidity_buffer: 8000.0,
      liquidity_updated_at: now,
    },
  ]);

  await upsertRows(client, 'instruments', [
    {
      id: TESS_ALPHA_SPY_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      symbol: 'SPY',
      name: 'SPDR S&P 500 ETF',
      asset_class: 'equity',
      currency: 'USD',
    },
    {
      id: TESS_ALPHA_AAPL_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      asset_class: 'equity',
      currency: 'USD',
    },
    {
      id: TESS_BETA_SPY_ID,
      firm_id: TESS_BETA_FIRM_ID,
      symbol: 'SPY',
      name: 'SPDR S&P 500 ETF',
      asset_class: 'equity',
      currency: 'USD',
    },
  ]);

  await upsertRows(client, 'holdings', [
    {
      id: TESS_ALPHA_HOLDING_SPY_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      portfolio_id: TESS_ALPHA_PORTFOLIO_ID,
      instrument_id: TESS_ALPHA_SPY_ID,
      quantity: 400,
      cost_basis: 180000.0,
      as_of: asOf,
    },
    {
      id: TESS_ALPHA_HOLDING_AAPL_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      portfolio_id: TESS_ALPHA_PORTFOLIO_ID,
      instrument_id: TESS_ALPHA_AAPL_ID,
      quantity: 250,
      cost_basis: 42000.0,
      as_of: asOf,
    },
    {
      id: TESS_BETA_HOLDING_ID,
      firm_id: TESS_BETA_FIRM_ID,
      portfolio_id: TESS_BETA_PORTFOLIO_ID,
      instrument_id: TESS_BETA_SPY_ID,
      quantity: 80,
      cost_basis: 36000.0,
      as_of: asOf,
    },
  ]);

  await upsertRows(client, 'notes', [
    {
      id: TESS_ALPHA_NOTE_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      client_id: TESS_ALPHA_CLIENT_ID,
      body: 'Tess QA: IPS review scheduled; liquidity buffer remains 75k.',
      created_by: TESS_ALPHA_ANALYST_ID,
    },
    {
      id: TESS_ALPHA_NOTE_B_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      client_id: TESS_ALPHA_CLIENT_B_ID,
      body: 'Tess QA: endowment spending policy unchanged this quarter.',
      created_by: TESS_ALPHA_MANAGER_ID,
    },
    {
      id: TESS_BETA_NOTE_ID,
      firm_id: TESS_BETA_FIRM_ID,
      client_id: TESS_BETA_CLIENT_ID,
      body: 'Tess QA: household cash needs over the next 90 days.',
      created_by: TESS_BETA_ANALYST_ID,
    },
  ]);

  await upsertRows(client, 'watchlists', [
    {
      id: TESS_ALPHA_WATCHLIST_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      name: 'Tess Alpha Watch',
      created_by: TESS_ALPHA_ANALYST_ID,
    },
    {
      id: TESS_BETA_WATCHLIST_ID,
      firm_id: TESS_BETA_FIRM_ID,
      name: 'Tess Beta Watch',
      created_by: TESS_BETA_ANALYST_ID,
    },
  ]);

  await upsertRows(client, 'watchlist_items', [
    {
      id: TESS_ALPHA_WATCHLIST_ITEM_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      watchlist_id: TESS_ALPHA_WATCHLIST_ID,
      instrument_id: TESS_ALPHA_SPY_ID,
      symbol: 'SPY',
      label: 'S&P 500 ETF',
    },
    {
      id: TESS_BETA_WATCHLIST_ITEM_ID,
      firm_id: TESS_BETA_FIRM_ID,
      watchlist_id: TESS_BETA_WATCHLIST_ID,
      instrument_id: TESS_BETA_SPY_ID,
      symbol: 'SPY',
      label: 'S&P 500 ETF',
    },
  ]);

  await upsertRows(client, 'workspace_focus', [
    {
      user_id: TESS_ALPHA_MANAGER_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      client_id: TESS_ALPHA_CLIENT_ID,
      portfolio_id: TESS_ALPHA_PORTFOLIO_ID,
      watchlist_id: TESS_ALPHA_WATCHLIST_ID,
    },
    {
      user_id: TESS_ALPHA_ANALYST_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      client_id: TESS_ALPHA_CLIENT_ID,
      portfolio_id: TESS_ALPHA_PORTFOLIO_ID,
      watchlist_id: TESS_ALPHA_WATCHLIST_ID,
    },
    {
      user_id: TESS_BETA_ANALYST_ID,
      firm_id: TESS_BETA_FIRM_ID,
      client_id: TESS_BETA_CLIENT_ID,
      portfolio_id: TESS_BETA_PORTFOLIO_ID,
      watchlist_id: TESS_BETA_WATCHLIST_ID,
    },
  ], 'user_id,firm_id');

  await upsertRows(client, 'reports', [
    {
      id: TESS_ALPHA_REPORT_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      client_id: TESS_ALPHA_CLIENT_ID,
      title: 'Tess Alpha quarterly draft',
      body: 'Draft overview for Tess QA.',
      sections: [
        {
          id: 'b0000000-0000-4000-8000-000000000091',
          heading: 'Overview',
          body: 'Draft overview for Tess QA.',
          ordinal: 0,
        },
      ],
      receipts: [],
      purpose: 'general',
      status: 'draft',
      created_by: TESS_ALPHA_ANALYST_ID,
      published_at: null,
    },
  ]);

  await upsertRows(client, 'scratchpads', [
    {
      id: TESS_ALPHA_SCRATCHPAD_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      portfolio_id: TESS_ALPHA_PORTFOLIO_ID,
      created_by: TESS_ALPHA_ANALYST_ID,
      name: 'Tess Alpha impact',
      scenario: {
        portfolio_id: TESS_ALPHA_PORTFOLIO_ID,
        holdings: [{ instrument_id: TESS_ALPHA_SPY_ID, symbol: 'SPY', quantity: 420 }],
      },
      watermark: 'SCRATCHPAD — not live / not source of truth',
    },
  ]);

  await upsertRows(client, 'proposals', [
    {
      id: TESS_ALPHA_PROPOSAL_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      kind: 'holding_changes',
      status: 'pending_confirm',
      payload: {
        portfolio_id: TESS_ALPHA_PORTFOLIO_ID,
        changes: [
          {
            op: 'upsert',
            instrument_id: TESS_ALPHA_SPY_ID,
            quantity: 410,
          },
        ],
      },
      preview: {
        title: 'Holding changes',
        summary: 'Tess QA: update SPY quantity to 410',
        diff: [{ op: 'upsert', symbol: 'SPY', quantity: 410 }],
      },
      requires_manager: true,
      requires_role: 'manager',
      created_by: TESS_ALPHA_ANALYST_ID,
      expires_at: expiresAt,
      idempotency_key: 'tess-alpha-holding-changes',
    },
  ]);

  await upsertRows(client, 'audit_events', [
    {
      id: TESS_ALPHA_AUDIT_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      actor_id: TESS_ALPHA_MANAGER_ID,
      action: 'tess.seed',
      entity_table: 'firms',
      entity_id: TESS_ALPHA_FIRM_ID,
      payload: { source: 'seed:tess', readable_by: 'firm_members' },
    },
    {
      id: TESS_ALPHA_AUDIT_B_ID,
      firm_id: TESS_ALPHA_FIRM_ID,
      actor_id: TESS_ALPHA_ANALYST_ID,
      action: 'note.read',
      entity_table: 'notes',
      entity_id: TESS_ALPHA_NOTE_ID,
      payload: { source: 'seed:tess', sensitive: true },
    },
    {
      id: TESS_BETA_AUDIT_ID,
      firm_id: TESS_BETA_FIRM_ID,
      actor_id: TESS_BETA_ANALYST_ID,
      action: 'tess.seed',
      entity_table: 'firms',
      entity_id: TESS_BETA_FIRM_ID,
      payload: { source: 'seed:tess', readable_by: 'firm_members' },
    },
  ]);

  return { actorIds, expiresAt };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{ dryRun?: boolean, createAdmin?: Function, argv?: string[] }} [options]
 */
export async function runTessDevelopSeed(env = process.env, options = {}) {
  const argv = options.argv ?? process.argv;
  const dryRun =
    options.dryRun === true ||
    argv.includes('--dry-run') ||
    String(env.TESS_SEED_DRY_RUN || '').trim() === '1';

  const locked = assertTessDevelopTarget(env);
  const inventory = buildTessFixtureInventory(env);

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      project_ref: locked.ref,
      project_url: locked.url,
      inventory,
    };
  }

  const supabase = (options.createAdmin || createServiceRoleClient)(env);
  await assertDevelopSchema(supabase);

  const password = tessQaPassword(env);
  for (const user of TESS_USERS) {
    await upsertAuthUser(supabase, { ...user, password });
  }

  await seedDomain(supabase, {
    manager: TESS_ALPHA_MANAGER_ID,
    analyst: TESS_ALPHA_ANALYST_ID,
  });

  return {
    ok: true,
    dry_run: false,
    project_ref: locked.ref,
    project_url: locked.url,
    alpha_firm_id: TESS_ALPHA_FIRM_ID,
    beta_firm_id: TESS_BETA_FIRM_ID,
    pending_proposal_id: TESS_ALPHA_PROPOSAL_ID,
    draft_report_id: TESS_ALPHA_REPORT_ID,
    inventory,
  };
}
