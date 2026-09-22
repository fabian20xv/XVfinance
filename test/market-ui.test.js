import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runChatTurn } from '../src/ai/runtime/turn.js';
import { StubMarketProvider } from '../src/market/provider.js';
import { SMOKE_FIRM_ID, SMOKE_MANAGER_ID } from '../src/db/smoke-ids.js';
import { ALLOWED_SUPABASE_URL } from '../src/config/supabase-lock.js';
import {
  applyMarketArtifact,
  applyMarketWorkspace,
  formatMarketCap,
  formatMarketField,
  formatQuoteChange,
  formatQuoteLast,
  isStubMarket,
  marketWorkspaceHasContent,
  payloadFromArtifact,
} from '../src/web/market-ui.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('market polish A', () => {
  it('labels stub payloads and leaves live results unlabeled', () => {
    assert.equal(isStubMarket({ stub: true, provider: 'stub', last: null }), true);
    assert.equal(isStubMarket({ provider: 'stub' }), true);
    assert.equal(isStubMarket({ stub: false, provider: 'http', last: 191.2 }), false);
    assert.equal(isStubMarket(null), false);
  });

  it('renders a null last as N/A and keeps a live price readable', () => {
    assert.equal(formatQuoteLast(null), 'N/A');
    assert.equal(formatQuoteLast(undefined), 'N/A');
    assert.equal(formatQuoteLast(''), 'N/A');
    assert.equal(formatQuoteLast(191.2), '191.20');
    assert.equal(formatQuoteChange({ last: null }), null);
    assert.equal(formatQuoteChange({ change: 1.25, change_pct: -0.4 }), '+1.25 · -0.4%');
    assert.equal(formatMarketField(null), 'N/A');
    assert.equal(formatMarketField('Technology'), 'Technology');
    assert.equal(formatMarketCap(null), 'N/A');
    assert.equal(formatMarketCap(2_500_000_000_000), '2.50T');
  });

  it('opens a non-blank workspace model from a stub quote', async () => {
    const quote = await new StubMarketProvider().getQuote({ symbol: 'SPY' });
    assert.equal(quote.stub, true);
    assert.equal(quote.symbol, 'SPY');
    assert.equal(quote.name, 'SPDR S&P 500 ETF');
    assert.equal(quote.currency, 'USD');
    assert.equal(quote.last, null);
    assert.equal(isStubMarket(quote), true);
    assert.equal(formatQuoteLast(quote.last), 'N/A');
    assert.equal(formatMarketField(quote.name), 'SPDR S&P 500 ETF');
    const fundamentals = await new StubMarketProvider().getFundamentals({ symbol: 'SPY' });
    assert.equal(fundamentals.pe, null);
    assert.equal(fundamentals.market_cap, null);
    assert.equal(formatMarketField(fundamentals.sector), 'N/A');
    assert.equal(formatMarketCap(fundamentals.market_cap), 'N/A');
    const workspace = applyMarketWorkspace(null, 'get_quote', quote);
    assert.equal(marketWorkspaceHasContent(workspace), true);
    assert.equal(workspace.quote.symbol, 'SPY');
    assert.equal(workspace.quote.last, null);
    const withFundamentals = applyMarketWorkspace(workspace, 'get_fundamentals', {
      stub: true,
      symbol: 'SPY',
      sector: null,
      pe: null,
      market_cap: null,
    });
    assert.equal(withFundamentals.fundamentals.symbol, 'SPY');
    assert.equal(withFundamentals.quote.symbol, 'SPY');
    const artifact = applyMarketArtifact(null, 'get_quote', quote);
    assert.equal(payloadFromArtifact(artifact, 'get_quote').symbol, 'SPY');
    assert.equal(payloadFromArtifact(artifact, 'list_holdings'), null);
  });

  it('tool SSE events and done artifacts carry the market payload', async () => {
    const events = [];
    const quote = {
      provider: 'stub',
      stub: true,
      symbol: 'AAPL',
      last: null,
      currency: 'USD',
      as_of: null,
    };
    const done = await runChatTurn({
      messages: [{ role: 'user', content: 'Quote AAPL' }],
      session: { userId: SMOKE_MANAGER_ID, firmId: SMOKE_FIRM_ID, role: 'manager' },
      userJwt: 'user-jwt',
      env: { SUPABASE_URL: ALLOWED_SUPABASE_URL, SUPABASE_ANON_KEY: 'anon' },
      emit: (event) => events.push(event),
      provider: {
        name: 'mock',
        model: 'mock-pm',
        async completeChat() {
          const step = this.steps[this.i++];
          return step;
        },
        i: 0,
        steps: [
          {
            content: '',
            toolCalls: [{ id: 'q1', name: 'get_quote', arguments: '{"symbol":"AAPL"}' }],
            usage: { completion_tokens: 2 },
          },
          { content: 'AAPL is stubbed.', toolCalls: [], usage: { completion_tokens: 3 } },
        ],
      },
      dispatch: async ({ name }) => {
        assert.equal(name, 'get_quote');
        return { ok: true, data: quote };
      },
    });
    const ok = events.find((event) => event.event === 'tool' && event.data.status === 'ok');
    assert.equal(ok.data.market.stub, true);
    assert.equal(ok.data.market.last, null);
    assert.equal(ok.data.market.symbol, 'AAPL');
    assert.equal(done.artifacts.market.quote.symbol, 'AAPL');
    assert.equal(done.artifacts.market.quote.stub, true);
  });

  it('wires chat cards and the market pane without a new route', () => {
    const thread = read('components/chat/ChatThread.tsx');
    const shell = read('components/shell/AppShell.tsx');
    const pane = read('components/workspace/MarketPane.tsx');
    const quote = read('components/market/QuoteCard.tsx');
    const badge = read('components/market/MarketSourceBadge.tsx');
    assert.match(thread, /MarketResultCard/);
    assert.match(thread, /ToolStatusPill/);
    assert.match(quote, /data-ui="chat.quote_card"/);
    assert.match(quote, /data-field="name"/);
    assert.match(quote, /data-field="currency"/);
    assert.match(quote, /formatQuoteLast/);
    assert.match(read('components/market/FundamentalsCard.tsx'), /data-field="currency"/);
    assert.match(pane, /data-stub=/);
    assert.match(badge, /Stub \/ sample data/);
    assert.match(badge, /Live/);
    assert.match(shell, /workspaceMode === 'market'/);
    assert.match(shell, /MarketPane/);
    assert.match(shell, /event\.market/);
    assert.match(pane, /data-ui="workspace.market_pane"/);
    assert.match(pane, /data-blank="false"/);
    assert.equal(existsRoute(read('src/server/http.js')), false);
  });
});

function existsRoute(http) {
  return /\/v1\/market/.test(http);
}
