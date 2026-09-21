import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ALLOWED_SUPABASE_URL } from '../src/config/supabase-lock.js';
import { createVercelAdapter, publicRequestUrl } from '../src/server/vercel-adapter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARENT_REF = 'krcwpupbdizzjyydzaqp';
const SECRET = 'xvfinance-test-jwt-secret-32chars!';
const SMOKE_SECRET = 'test-smoke-secret';

const baseEnv = {
  SUPABASE_URL: ALLOWED_SUPABASE_URL,
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_JWT_SECRET: SECRET,
  APP_ENV: 'preview',
  GIT_COMMIT: 'adapter-sha',
};

async function withAdapter(t, { env = {}, deps = {} } = {}, fn) {
  const server = createServer(
    createVercelAdapter({
      env: { ...baseEnv, ...env },
      deps,
    })
  );
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return fn(port);
}

describe('Vercel adapter', () => {
  it('vercel.json sends health, smoke, /health, and /v1/* to the Function', () => {
    const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
    assert.equal(config.framework, 'nextjs');
    assert.equal(config.buildCommand, 'next build');
    const sources = config.rewrites.map((rule) => rule.source);
    const destinations = config.rewrites.map((rule) => rule.destination);
    for (const source of ['/api/health', '/api/smoke', '/health', '/v1/:path*']) {
      assert.ok(sources.includes(source), `missing rewrite source ${source}`);
    }
    assert.match(destinations.join('\n'), /\/api/);
    assert.equal(
      config.rewrites.find((rule) => rule.source === '/health').destination,
      '/api?xv_path=/health'
    );
    assert.equal(
      config.rewrites.find((rule) => rule.source === '/v1/:path*').destination,
      '/api?xv_path=/v1/:path*'
    );
  });

  it('api/index.js reuses createVercelAdapter (no forked routes)', () => {
    const entry = readFileSync(join(root, 'api/index.js'), 'utf8');
    const catchAll = readFileSync(join(root, 'api/[...path].js'), 'utf8');
    const adapter = readFileSync(join(root, 'src/server/vercel-adapter.js'), 'utf8');
    assert.match(entry, /createVercelAdapter/);
    assert.match(catchAll, /from '\.\/index\.js'/);
    assert.match(adapter, /createRequestListener/);
    assert.doesNotMatch(adapter, /path === '\/api\/health'/);
    assert.doesNotMatch(entry, /\/v1\/session/);
  });

  it('publicRequestUrl restores vercel.json xv_path rewrites and leaves /api/health alone', () => {
    assert.equal(publicRequestUrl({ url: '/api/health', headers: {} }), '/api/health');
    assert.equal(publicRequestUrl({ url: '/api/smoke', headers: {} }), '/api/smoke');
    assert.equal(publicRequestUrl({ url: '/api?xv_path=/health', headers: {} }), '/health');
    assert.equal(
      publicRequestUrl({ url: '/api?xv_path=/v1/session', headers: {} }),
      '/v1/session'
    );
    assert.equal(
      publicRequestUrl({ url: '/api?xv_path=/v1/proposals&status=pending', headers: {} }),
      '/v1/proposals?status=pending'
    );
    assert.equal(
      publicRequestUrl({ url: '/api', headers: { 'x-forwarded-uri': '/health' } }),
      '/health'
    );
  });

  it('GET /api/health through the adapter matches the E0 listener', async (t) => {
    await withAdapter(t, {}, async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.commit, 'adapter-sha');
      assert.equal(body.env, 'preview');
      assert.equal(body.supabaseRef, PARENT_REF);
    });
  });

  it('rewritten /health and /v1/session hit the same listener', async (t) => {
    await withAdapter(t, {}, async (port) => {
      const health = await fetch(`http://127.0.0.1:${port}/api?xv_path=/health`);
      assert.equal(health.status, 200);
      const healthBody = await health.json();
      assert.equal(healthBody.ok, true);
      assert.equal(healthBody.data.project_ref, PARENT_REF);

      const session = await fetch(`http://127.0.0.1:${port}/api?xv_path=/v1/session`);
      assert.equal(session.status, 401);
      const sessionBody = await session.json();
      assert.equal(sessionBody.error.code, 'unauthenticated');
    });
  });

  it('POST /api/smoke through the adapter stays disabled in production and gated by secret', async (t) => {
    await withAdapter(t, { env: { SMOKE_SECRET, APP_ENV: 'staging' } }, async (port) => {
      const missing = await fetch(`http://127.0.0.1:${port}/api/smoke`, { method: 'POST' });
      assert.equal(missing.status, 401);
    });
    await withAdapter(
      t,
      { env: { SMOKE_SECRET, VERCEL_ENV: 'production' } },
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/api/smoke`, {
          method: 'POST',
          headers: { 'x-smoke-secret': SMOKE_SECRET },
        });
        assert.equal(res.status, 403);
      }
    );
    await withAdapter(t, { env: { SMOKE_SECRET, APP_ENV: 'preview' } }, async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/api?xv_path=/api/smoke`, {
        method: 'POST',
        headers: { 'x-smoke-secret': SMOKE_SECRET },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.supabaseRef, PARENT_REF);
    });
  });
});
