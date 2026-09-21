import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dispatchTool, listToolNames } from '../src/chat/tool-router.js';
import { asAuditEntityId } from '../src/audit/entity-id.js';
import { createMarketProvider, StubMarketProvider, hasLiveMarketKey } from '../src/market/provider.js';
import { completeToolSuccess } from '../src/server/tool-response.js';
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

  it('never writes a ticker string as audit entityId', async () => {
    const quote = await run('get_quote', { symbol: 'SPY' });
    const fundamentals = await run('get_fundamentals', { symbol: 'AAPL' });
    const news = await run('get_news_headlines', { symbol: 'MSFT' });
    const search = await run('search_instruments', { q: 'SPY' });

    for (const result of [quote, fundamentals, news, search]) {
      assert.equal(result.ok, true);
      assert.equal(asAuditEntityId(result.audit.entityId), result.audit.entityId ?? null);
      assert.notEqual(result.audit.entityId, 'SPY');
      assert.notEqual(result.audit.entityId, 'AAPL');
      assert.notEqual(result.audit.entityId, 'MSFT');
      if (result.data.symbol) {
        assert.notEqual(String(result.audit.entityId ?? '').toUpperCase(), result.data.symbol);
      }
    }

    const writes = [];
    const completed = await completeToolSuccess({
      session,
      result: quote,
      writeAudit: async (event) => {
        writes.push(event);
        return 'audit-quote';
      },
    });
    assert.equal(completed.status, 200);
    assert.equal(writes[0].entityId, null);
    assert.notEqual(writes[0].entityId, 'SPY');
  });
});
