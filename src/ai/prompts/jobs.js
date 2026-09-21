/**
 * Top-10 Portfolio Manager jobs the E11 agent is hired to do.
 * Tools named here already exist on the E2 allowlist — do not invent APIs.
 */

export const PM_JOBS = Object.freeze([
  Object.freeze({
    id: 'stock_interest',
    title: 'Stock interest → report / impact',
    summary:
      'When a manager asks about a name, pull quote/fundamentals/news, then draft a short report or Impact Scratchpad what-if — never mutate live holdings.',
    tools: Object.freeze([
      'search_instruments',
      'get_quote',
      'get_fundamentals',
      'get_news_headlines',
      'create_report_draft',
      'update_report_section',
      'create_scratchpad',
      'get_scratchpad_impact',
    ]),
  }),
  Object.freeze({
    id: 'performance',
    title: 'Performance',
    summary: 'Read portfolios and holdings; summarize cash, weights, and notable movers. Use reports for a written recap.',
    tools: Object.freeze(['list_portfolios', 'get_portfolio', 'list_holdings', 'get_holding', 'list_reports', 'create_report_draft']),
  }),
  Object.freeze({
    id: 'rebalance',
    title: 'Rebalance',
    summary:
      'Model a rebalance on the Impact Scratchpad, show impact vs live, then promote_scratchpad (manager ConfirmCard). Never write holdings directly.',
    tools: Object.freeze([
      'get_portfolio',
      'list_holdings',
      'create_scratchpad',
      'update_scratchpad',
      'get_scratchpad_impact',
      'promote_scratchpad',
      'propose_holding_changes',
    ]),
  }),
  Object.freeze({
    id: 'earnings',
    title: 'Earnings',
    summary: 'Fetch headlines/fundamentals around a symbol and relate them to current holdings or the watchlist.',
    tools: Object.freeze(['get_news_headlines', 'get_fundamentals', 'get_quote', 'list_holdings', 'list_watchlist_items']),
  }),
  Object.freeze({
    id: 'meeting_prep',
    title: 'Meeting prep',
    summary:
      'Ghostwrite a meeting 1-pager with receipt marks [1], not citations. Client-facing send is propose_meeting_send (manager confirm).',
    tools: Object.freeze([
      'get_client',
      'get_contact',
      'list_notes',
      'get_note',
      'ghostwrite_meeting_one_pager',
      'get_meeting_receipts',
      'propose_meeting_send',
    ]),
  }),
  Object.freeze({
    id: 'watchlist',
    title: 'Watchlist',
    summary: 'Read watchlists; mutations go through propose_watchlist_upsert and stay pending until Confirm change.',
    tools: Object.freeze(['list_watchlists', 'get_watchlist', 'list_watchlist_items', 'propose_watchlist_upsert']),
  }),
  Object.freeze({
    id: 'concentration',
    title: 'Concentration',
    summary: 'Flag oversized names vs the book. What-if trims belong on the scratchpad; live cuts are propose_holding_changes.',
    tools: Object.freeze(['list_holdings', 'get_portfolio', 'create_scratchpad', 'get_scratchpad_impact', 'propose_holding_changes']),
  }),
  Object.freeze({
    id: 'reporting',
    title: 'Reporting',
    summary: 'Draft and section-edit reports directly; publish is propose_report_publish (manager). Export is audited with public_url null.',
    tools: Object.freeze([
      'list_reports',
      'get_report',
      'create_report_draft',
      'update_report_section',
      'propose_report_publish',
      'export_published_report',
    ]),
  }),
  Object.freeze({
    id: 'relationship_memory',
    title: 'Relationship memory',
    summary: 'Clients, contacts, and notes. New/updated notes are proposals (any_member confirm). High-PII is never dumped wholesale.',
    tools: Object.freeze([
      'list_clients',
      'get_client',
      'get_contact',
      'list_notes',
      'get_note',
      'propose_note_create',
      'propose_note_update',
      'propose_client_upsert',
      'propose_contact_upsert',
    ]),
  }),
  Object.freeze({
    id: 'cash_liquidity',
    title: 'Cash / liquidity',
    summary: 'Read cash_balance, cash_currency, liquidity_available, liquidity_buffer on get_portfolio / list_portfolios.',
    tools: Object.freeze(['get_portfolio', 'list_portfolios', 'list_holdings']),
  }),
]);

export function formatPmJobsForPrompt(jobs = PM_JOBS) {
  return jobs
    .map((job, index) => `${index + 1}. **${job.title}** — ${job.summary} Tools: ${job.tools.join(', ')}.`)
    .join('\n');
}
