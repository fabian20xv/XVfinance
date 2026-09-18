import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const LOCKED_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const WRONG_URL = 'https://abcdefghijklmnopqrst.supabase.co';

function runScript(script, env) {
  return spawnSync(process.execPath, [script], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

describe('CA-1.4 seed/smoke refuse any project except krcwpupbdizzjyydzaqp', () => {
  it('seed-dev.js fails loud when SUPABASE_URL is missing', () => {
    const result = runScript('scripts/seed-dev.js', { SUPABASE_URL: '' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /seed aborted/);
    assert.match(result.stderr, /SUPABASE_URL is required|krcwpupbdizzjyydzaqp/);
  });

  it('seed-dev.js fails loud when pointed at another Supabase project', () => {
    const result = runScript('scripts/seed-dev.js', {
      SUPABASE_URL: WRONG_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key-not-used',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refused Supabase project ref/);
  });

  it('smoke-e1.js fails loud when pointed at another Supabase project', () => {
    const result = runScript('scripts/smoke-e1.js', {
      SUPABASE_URL: WRONG_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key-not-used',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refused Supabase project ref/);
  });

  it('smoke-e5-e8.js fails loud when pointed at another Supabase project', () => {
    const result = runScript('scripts/smoke-e5-e8.js', {
      SUPABASE_URL: WRONG_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key-not-used',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refused Supabase project ref/);
  });

  it('seed-dev.js fails when the service-role key is still a placeholder even on the locked URL', () => {
    const result = runScript('scripts/seed-dev.js', {
      SUPABASE_URL: LOCKED_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'replace-with-service-role-key',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /placeholder|missing/i);
  });
});
