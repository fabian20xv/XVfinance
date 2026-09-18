import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dispatchTool, listToolNames } from '../src/chat/tool-router.js';
import { createMarketProvider, StubMarketProvider, hasLiveMarketKey } from '../src/market/provider.js';
import { SMOKE_FIRM_ID, SMOKE_MANAGER_ID } from '../src/db/smoke-ids.js';

const env = {
  SUPABASE_URL: 'https://krcwpupbdizzjyydzaqp.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
};

const session = {
  userId: SMOKE_MANAGER_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'manager',
};

async function run(name, args, extraEnv = {}) {
  return dispatchTool({
    name,
    args,
    session,
    userJwt: 'user-jwt',
    env: { ...env, ...extraEnv },
    createUserClient: () => ({ kind: 'user' }),
  });
}

describe('CA-7 market read tools', () => {
  it('wires quote, fundamentals, news, and search on the allowlist', () => {
    const names = listToolNames();
    for (const name of [
      'get_quote',
      'get_fundamentals',
      'get_news_headlines',
      'search_instruments',
    ]) {
      assert.ok(names.includes(name), name);
    }
  });

  it('uses the stub provider when no live market key is set', () => {
    assert.equal(hasLiveMarketKey({ MARKET_API_KEY: 'replace-with-market-api-key-or-leave-stub' }), false);
    const provider = createMarketProvider({});
    assert.ok(provider instanceof StubMarketProvider);
  });

  it('returns equities-first stub quotes and search hits', async () => {
    const quote = await run('get_quote', { symbol: 'spy' });
    assert.equal(quote.ok, true);
    assert.equal(quote.data.provider, 'stub');
    assert.equal(quote.data.stub, true);
    assert.equal(quote.data.symbol, 'SPY');
    assert.equal(quote.data.asset_class, 'equity');

    const search = await run('search_instruments', { q: 'apple' });
    assert.equal(search.ok, true);
    assert.equal(search.data.asset_class_preference, 'equity');
    assert.ok(search.data.items.some((row) => row.symbol === 'AAPL'));

    const news = await run('get_news_headlines', { symbol: 'MSFT', limit: 3 });
    assert.equal(news.ok, true);
    assert.deepEqual(news.data.headlines, []);

    const fundamentals = await run('get_fundamentals', { symbol: 'NVDA' });
    assert.equal(fundamentals.ok, true);
    assert.equal(fundamentals.data.stub, true);
  });
});
