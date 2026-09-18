import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { boot } from '../src/config/startup.js';
import {
  ALLOWED_SUPABASE_PROJECT_REF,
  ALLOWED_SUPABASE_URL,
  assertAllowedSupabaseUrl,
  parseSupabaseProjectRef,
} from '../src/config/supabase-lock.js';

const LOCKED_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const LOCKED_REF = 'krcwpupbdizzjyydzaqp';

describe('CA-0.1 Supabase project lock', () => {
  it('pins the only allowed URL and ref', () => {
    assert.equal(ALLOWED_SUPABASE_PROJECT_REF, LOCKED_REF);
    assert.equal(ALLOWED_SUPABASE_URL, LOCKED_URL);
  });

  it('accepts the locked project URL', () => {
    const result = assertAllowedSupabaseUrl(LOCKED_URL);
    assert.deepEqual(result, {
      ref: LOCKED_REF,
      host: `${LOCKED_REF}.supabase.co`,
      url: LOCKED_URL,
    });
  });

  it('parses the project ref from the host', () => {
    assert.equal(parseSupabaseProjectRef(LOCKED_URL), LOCKED_REF);
  });

  it('fails loud when SUPABASE_URL is missing', () => {
    assert.throws(() => assertAllowedSupabaseUrl(''), /SUPABASE_URL is required/);
    assert.throws(() => boot({}), /SUPABASE_URL is required/);
  });

  it('fails loud for a different Supabase project ref', () => {
    assert.throws(
      () => assertAllowedSupabaseUrl('https://abcdefghijklmnopqrst.supabase.co'),
      /Refused Supabase project ref/
    );
  });

  it('fails loud for a non-Supabase host', () => {
    assert.throws(
      () => assertAllowedSupabaseUrl('https://example.com'),
      /host must be \{project-ref\}\.supabase\.co/
    );
  });

  it('fails loud for http', () => {
    assert.throws(
      () => assertAllowedSupabaseUrl('http://krcwpupbdizzjyydzaqp.supabase.co'),
      /must use https/
    );
  });

  it('startup boot accepts the lock and rejects others', () => {
    const ok = boot({ SUPABASE_URL: LOCKED_URL });
    assert.equal(ok.ref, LOCKED_REF);

    assert.throws(
      () => boot({ SUPABASE_URL: 'https://otherproject12345.supabase.co' }),
      /Refused Supabase project ref/
    );
  });

  it('src/index.js exits non-zero when pointed at the wrong project', () => {
    const result = spawnSync(process.execPath, ['src/index.js'], {
      env: { ...process.env, SUPABASE_URL: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /startup aborted/);
    assert.match(result.stderr, /Refused Supabase project ref/);
  });

  it('src/index.js succeeds when pointed at the locked project', () => {
    const result = spawnSync(process.execPath, ['src/index.js'], {
      env: { ...process.env, SUPABASE_URL: LOCKED_URL },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /locked Supabase project krcwpupbdizzjyydzaqp/);
  });

  it('scripts/assert-supabase-lock.js fails when env points elsewhere', () => {
    const result = spawnSync(process.execPath, ['scripts/assert-supabase-lock.js'], {
      env: { ...process.env, SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /process\.env\.SUPABASE_URL rejected/);
  });

  it('scripts/assert-supabase-lock.js passes for the locked URL', () => {
    const result = spawnSync(process.execPath, ['scripts/assert-supabase-lock.js'], {
      env: { ...process.env, SUPABASE_URL: LOCKED_URL },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Supabase project lock asserted/);
  });
});
