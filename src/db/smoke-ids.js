/**
 * Well-known IDs for the locked-project smoke fixture.
 * Must stay in sync with supabase/migrations E1 seed function.
 */
export const SMOKE_FIRM_ID = 'a0000000-0000-4000-8000-000000000001';
export const SMOKE_MANAGER_ID = 'a0000000-0000-4000-8000-0000000000aa';
export const SMOKE_ANALYST_ID = 'a0000000-0000-4000-8000-0000000000bb';
export const SMOKE_CLIENT_ID = 'a0000000-0000-4000-8000-000000000010';
export const SMOKE_CONTACT_ID = 'a0000000-0000-4000-8000-000000000011';
export const SMOKE_PORTFOLIO_ID = 'a0000000-0000-4000-8000-000000000020';
export const SMOKE_INSTRUMENT_ID = 'a0000000-0000-4000-8000-000000000030';
export const SMOKE_HOLDING_ID = 'a0000000-0000-4000-8000-000000000040';
export const SMOKE_NOTE_ID = 'a0000000-0000-4000-8000-000000000050';
export const SMOKE_REPORT_ID = 'a0000000-0000-4000-8000-000000000060';
export const SMOKE_PROPOSAL_ID = 'a0000000-0000-4000-8000-000000000070';
export const SMOKE_NOTE_PROPOSAL_ID = 'a0000000-0000-4000-8000-000000000071';
export const SMOKE_AUDIT_ID = 'a0000000-0000-4000-8000-000000000080';
export const SMOKE_WATCHLIST_ID = 'a0000000-0000-4000-8000-000000000090';
export const SMOKE_WATCHLIST_ITEM_ID = 'a0000000-0000-4000-8000-000000000091';
export const SMOKE_SCRATCHPAD_ID = 'a0000000-0000-4000-8000-000000000092';

export const SMOKE_FIRM_NAME = 'XVfinance Smoke Firm';

export const DOMAIN_TABLES = Object.freeze([
  'clients',
  'contacts',
  'portfolios',
  'instruments',
  'holdings',
  'notes',
  'reports',
  'proposals',
  'audit_events',
]);

export const TENANCY_TABLES = Object.freeze(['firms', 'firm_members']);

export const FIRM_ROLES = Object.freeze(['manager', 'analyst']);

export const E3_TABLES = Object.freeze(['watchlists', 'watchlist_items', 'workspace_focus']);

export const E5_E8_TABLES = Object.freeze(['scratchpads']);
