import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { boot } from '../src/config/startup.js';
import { getPublicSupabaseConfig } from '../src/client/public-config.js';
import {
  ALLOWED_SUPABASE_PROJECT_REF,
  ALLOWED_SUPABASE_PROJECT_REFS,
  ALLOWED_SUPABASE_URL,
  ALLOWED_SUPABASE_URLS,
  DEVELOP_SUPABASE_PROJECT_REF,
  PARENT_SUPABASE_PROJECT_REF,
  assertAllowedSupabaseUrl,
  parseSupabaseProjectRef,
} from '../src/config/supabase-lock.js';

const PARENT_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const PARENT_REF = 'krcwpupbdizzjyydzaqp';
const DEVELOP_URL = 'https://bkwhqfkosxnoffpsjcug.supabase.co';
const DEVELOP_REF = 'bkwhqfkosxnoffpsjcug';
const THIRD_URL = 'https://abcdefghijklmnopqrst.supabase.co';

describe('CA-0.1 Supabase project lock', () => {
  it('pins exactly the parent and develop refs', () => {
    assert.deepEqual(ALLOWED_SUPABASE_PROJECT_REFS, [PARENT_REF, DEVELOP_REF]);
    assert.deepEqual(ALLOWED_SUPABASE_URLS, [PARENT_URL, DEVELOP_URL]);
    assert.equal(PARENT_SUPABASE_PROJECT_REF, PARENT_REF);
    assert.equal(DEVELOP_SUPABASE_PROJECT_REF, DEVELOP_REF);
    assert.equal(ALLOWED_SUPABASE_PROJECT_REF, PARENT_REF);
    assert.equal(ALLOWED_SUPABASE_URL, PARENT_URL);
  });

  it('accepts the parent/prod project URL', () => {
    const result = assertAllowedSupabaseUrl(PARENT_URL);
    assert.deepEqual(result, {
      ref: PARENT_REF,
      host: `${PARENT_REF}.supabase.co`,
      url: PARENT_URL,
      role: 'parent',
      jwtIssuer: `${PARENT_URL}/auth/v1`,
    });
  });

  it('accepts the develop/staging project URL', () => {
    const result = assertAllowedSupabaseUrl(DEVELOP_URL);
    assert.deepEqual(result, {
      ref: DEVELOP_REF,
      host: `${DEVELOP_REF}.supabase.co`,
      url: DEVELOP_URL,
      role: 'develop',
      jwtIssuer: `${DEVELOP_URL}/auth/v1`,
    });
  });

  it('parses the project ref from the host', () => {
    assert.equal(parseSupabaseProjectRef(PARENT_URL), PARENT_REF);
    assert.equal(parseSupabaseProjectRef(DEVELOP_URL), DEVELOP_REF);
  });

  it('fails loud when SUPABASE_URL is missing', () => {
    assert.throws(() => assertAllowedSupabaseUrl(''), /SUPABASE_URL is required/);
    assert.throws(() => boot({}), /SUPABASE_URL is required/);
  });

  it('fails loud for a third Supabase project ref', () => {
    assert.throws(
      () => assertAllowedSupabaseUrl(THIRD_URL),
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

  it('startup boot accepts both allowlisted refs and rejects others', () => {
    const parent = boot({ SUPABASE_URL: PARENT_URL });
    assert.equal(parent.ref, PARENT_REF);
    assert.equal(parent.role, 'parent');

    const develop = boot({ SUPABASE_URL: DEVELOP_URL, APP_ENV: 'staging' });
    assert.equal(develop.ref, DEVELOP_REF);
    assert.equal(develop.role, 'develop');

    assert.throws(
      () => boot({ SUPABASE_URL: 'https://otherproject12345.supabase.co' }),
      /Refused Supabase project ref/
    );
  });

  it('startup boot refuses the develop ref in production', () => {
    assert.throws(
      () => boot({ SUPABASE_URL: DEVELOP_URL, APP_ENV: 'production' }),
      /develop\/staging Supabase ref/
    );
    assert.throws(
      () => boot({ SUPABASE_URL: DEVELOP_URL, VERCEL_ENV: 'production' }),
      /develop\/staging Supabase ref/
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

  it('src/index.js succeeds when pointed at the parent project without --serve', () => {
    const result = spawnSync(process.execPath, ['src/index.js'], {
      env: { ...process.env, SUPABASE_URL: PARENT_URL },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /locked Supabase project krcwpupbdizzjyydzaqp/);
    assert.doesNotMatch(result.stdout, /listening/i);
  });

  it('scripts/assert-supabase-lock.js fails when env points elsewhere', () => {
    const result = spawnSync(process.execPath, ['scripts/assert-supabase-lock.js'], {
      env: { ...process.env, SUPABASE_URL: THIRD_URL },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /process\.env\.SUPABASE_URL rejected/);
  });

  it('scripts/assert-supabase-lock.js passes for the parent URL', () => {
    const result = spawnSync(process.execPath, ['scripts/assert-supabase-lock.js'], {
      env: { ...process.env, SUPABASE_URL: PARENT_URL },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Supabase project lock asserted/);
  });

  it('scripts/assert-supabase-lock.js passes for the develop URL', () => {
    const result = spawnSync(process.execPath, ['scripts/assert-supabase-lock.js'], {
      env: { ...process.env, SUPABASE_URL: DEVELOP_URL },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Supabase project lock asserted/);
  });

  it('public client config accepts either allowlisted URL', () => {
    const parent = getPublicSupabaseConfig({
      SUPABASE_URL: PARENT_URL,
      SUPABASE_ANON_KEY: 'anon',
    });
    assert.equal(parent.url, PARENT_URL);

    const develop = getPublicSupabaseConfig({
      SUPABASE_URL: DEVELOP_URL,
      SUPABASE_ANON_KEY: 'anon',
    });
    assert.equal(develop.url, DEVELOP_URL);
  });
});
