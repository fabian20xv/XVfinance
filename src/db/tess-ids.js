/**
 * Well-known Tess QA fixture IDs for the develop Supabase project only.
 * Never reuse these rows on parent/prod (krcwpupbdizzjyydzaqp).
 */
import {
  DEVELOP_SUPABASE_PROJECT,
  PARENT_SUPABASE_PROJECT,
} from '../config/supabase-lock.js';

export const TESS_DEVELOP_PROJECT_REF = DEVELOP_SUPABASE_PROJECT.ref;
export const TESS_DEVELOP_PROJECT_URL = DEVELOP_SUPABASE_PROJECT.url;
export const TESS_FORBIDDEN_PARENT_REF = PARENT_SUPABASE_PROJECT.ref;
export const TESS_FORBIDDEN_PARENT_URL = PARENT_SUPABASE_PROJECT.url;

/** QA-only login password for Tess fixture users (override with TESS_QA_PASSWORD). */
export const TESS_QA_DEFAULT_PASSWORD = 'TessQa.Develop.Only.2026!';

export const TESS_ALPHA_FIRM_ID = 'b0000000-0000-4000-8000-000000000001';
export const TESS_BETA_FIRM_ID = 'b0000000-0000-4000-8000-000000000002';

export const TESS_ALPHA_MANAGER_ID = 'b0000000-0000-4000-8000-0000000000aa';
export const TESS_ALPHA_ANALYST_ID = 'b0000000-0000-4000-8000-0000000000ab';
export const TESS_BETA_MANAGER_ID = 'b0000000-0000-4000-8000-0000000000ba';
export const TESS_BETA_ANALYST_ID = 'b0000000-0000-4000-8000-0000000000bb';

export const TESS_ALPHA_CLIENT_ID = 'b0000000-0000-4000-8000-000000000010';
export const TESS_ALPHA_CLIENT_B_ID = 'b0000000-0000-4000-8000-000000000011';
export const TESS_BETA_CLIENT_ID = 'b0000000-0000-4000-8000-000000000012';

export const TESS_ALPHA_CONTACT_ID = 'b0000000-0000-4000-8000-000000000020';
export const TESS_ALPHA_CONTACT_B_ID = 'b0000000-0000-4000-8000-000000000021';
export const TESS_BETA_CONTACT_ID = 'b0000000-0000-4000-8000-000000000022';

export const TESS_ALPHA_PORTFOLIO_ID = 'b0000000-0000-4000-8000-000000000030';
export const TESS_ALPHA_PORTFOLIO_B_ID = 'b0000000-0000-4000-8000-000000000031';
export const TESS_BETA_PORTFOLIO_ID = 'b0000000-0000-4000-8000-000000000032';

export const TESS_ALPHA_SPY_ID = 'b0000000-0000-4000-8000-000000000040';
export const TESS_ALPHA_AAPL_ID = 'b0000000-0000-4000-8000-000000000041';
export const TESS_BETA_SPY_ID = 'b0000000-0000-4000-8000-000000000042';

export const TESS_ALPHA_HOLDING_SPY_ID = 'b0000000-0000-4000-8000-000000000050';
export const TESS_ALPHA_HOLDING_AAPL_ID = 'b0000000-0000-4000-8000-000000000051';
export const TESS_BETA_HOLDING_ID = 'b0000000-0000-4000-8000-000000000052';

export const TESS_ALPHA_NOTE_ID = 'b0000000-0000-4000-8000-000000000060';
export const TESS_ALPHA_NOTE_B_ID = 'b0000000-0000-4000-8000-000000000061';
export const TESS_BETA_NOTE_ID = 'b0000000-0000-4000-8000-000000000062';

export const TESS_ALPHA_WATCHLIST_ID = 'b0000000-0000-4000-8000-000000000070';
export const TESS_BETA_WATCHLIST_ID = 'b0000000-0000-4000-8000-000000000071';
export const TESS_ALPHA_WATCHLIST_ITEM_ID = 'b0000000-0000-4000-8000-000000000072';
export const TESS_BETA_WATCHLIST_ITEM_ID = 'b0000000-0000-4000-8000-000000000073';

export const TESS_ALPHA_PROPOSAL_ID = 'b0000000-0000-4000-8000-000000000080';
export const TESS_ALPHA_REPORT_ID = 'b0000000-0000-4000-8000-000000000090';
export const TESS_ALPHA_AUDIT_ID = 'b0000000-0000-4000-8000-0000000000a0';
export const TESS_ALPHA_AUDIT_B_ID = 'b0000000-0000-4000-8000-0000000000a1';
export const TESS_BETA_AUDIT_ID = 'b0000000-0000-4000-8000-0000000000a2';
export const TESS_ALPHA_SCRATCHPAD_ID = 'b0000000-0000-4000-8000-0000000000b0';

export const TESS_ALPHA_FIRM_NAME = 'Tess Alpha Wealth (develop QA)';
export const TESS_BETA_FIRM_NAME = 'Tess Beta Advisors (develop QA)';

export const TESS_USERS = Object.freeze([
  {
    id: TESS_ALPHA_MANAGER_ID,
    firm_id: TESS_ALPHA_FIRM_ID,
    firm_label: TESS_ALPHA_FIRM_NAME,
    email: 'tess.alpha.manager@xvfinance.invalid',
    role: 'manager',
    writer: 'privileged',
    platform_admin: false,
  },
  {
    id: TESS_ALPHA_ANALYST_ID,
    firm_id: TESS_ALPHA_FIRM_ID,
    firm_label: TESS_ALPHA_FIRM_NAME,
    email: 'tess.alpha.analyst@xvfinance.invalid',
    role: 'analyst',
    writer: 'restricted',
    platform_admin: false,
  },
  {
    id: TESS_BETA_MANAGER_ID,
    firm_id: TESS_BETA_FIRM_ID,
    firm_label: TESS_BETA_FIRM_NAME,
    email: 'tess.beta.manager@xvfinance.invalid',
    role: 'manager',
    writer: 'privileged',
    platform_admin: false,
  },
  {
    id: TESS_BETA_ANALYST_ID,
    firm_id: TESS_BETA_FIRM_ID,
    firm_label: TESS_BETA_FIRM_NAME,
    email: 'tess.beta.analyst@xvfinance.invalid',
    role: 'analyst',
    writer: 'restricted',
    platform_admin: false,
  },
]);

/**
 * Top-10 investment-manager jobs Tess should be able to accept against this fixture.
 */
export const TESS_TOP_10_JOBS = Object.freeze([
  {
    id: 1,
    job: 'Review clients',
    tables: ['clients'],
    tools: ['list_clients', 'get_client'],
  },
  {
    id: 2,
    job: 'Review contacts',
    tables: ['contacts'],
    tools: ['get_contact'],
  },
  {
    id: 3,
    job: 'Review portfolios with cash and liquidity',
    tables: ['portfolios'],
    tools: ['list_portfolios', 'get_portfolio'],
  },
  {
    id: 4,
    job: 'Review holdings',
    tables: ['holdings', 'instruments'],
    tools: ['list_holdings', 'get_holding'],
  },
  {
    id: 5,
    job: 'Read client notes',
    tables: ['notes'],
    tools: ['list_notes', 'get_note'],
  },
  {
    id: 6,
    job: 'Review watchlists',
    tables: ['watchlists', 'watchlist_items'],
    tools: ['list_watchlists', 'get_watchlist'],
  },
  {
    id: 7,
    job: 'Review a pending proposal',
    tables: ['proposals'],
    tools: ['list_proposals', 'get_proposal', 'confirm_proposal'],
  },
  {
    id: 8,
    job: 'Open a draft report',
    tables: ['reports'],
    tools: ['list_reports', 'get_report', 'create_report_draft'],
  },
  {
    id: 9,
    job: 'Read firm audit events (RLS select)',
    tables: ['audit_events'],
    tools: [],
  },
  {
    id: 10,
    job: 'Session and workspace focus',
    tables: ['workspace_focus', 'firm_members'],
    tools: ['get_session', 'get_session_context', 'set_workspace_focus'],
  },
]);

export const TESS_SCHEMA_TABLES = Object.freeze([
  'firms',
  'firm_members',
  'clients',
  'contacts',
  'portfolios',
  'instruments',
  'holdings',
  'notes',
  'reports',
  'proposals',
  'audit_events',
  'watchlists',
  'watchlist_items',
  'workspace_focus',
  'scratchpads',
]);
