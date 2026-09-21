import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  getPublicSupabaseConfig,
  pickPublicSupabaseEnv,
  tryGetPublicSupabaseConfig,
} from '../src/client/public-config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARENT_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const DEVELOP_URL = 'https://bkwhqfkosxnoffpsjcug.supabase.co';
const THIRD_URL = 'https://abcdefghijklmnopqrst.supabase.co';

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function nonEnumerableEnv(values) {
  return new Proxy(values, {
    ownKeys() {
      throw new Error('Edge process.env is not enumerable');
    },
    getOwnPropertyDescriptor() {
      return undefined;
    },
  });
}

describe('Preview middleware fail-open (public Supabase config)', () => {
  it('picks named public keys and treats blank strings as unset', () => {
    const picked = pickPublicSupabaseEnv({
      NEXT_PUBLIC_SUPABASE_URL: '  ',
      SUPABASE_URL: DEVELOP_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ' anon ',
      SUPABASE_SERVICE_ROLE_KEY: 'must-not-be-copied',
      OPENAI_API_KEY: 'sk-must-not-be-copied',
      APP_ENV: 'staging',
    });
    assert.equal(picked.NEXT_PUBLIC_SUPABASE_URL, undefined);
    assert.equal(picked.SUPABASE_URL, DEVELOP_URL);
    assert.equal(picked.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'anon');
    assert.equal(picked.APP_ENV, 'staging');
    assert.equal('SUPABASE_SERVICE_ROLE_KEY' in picked, false);
    assert.equal('OPENAI_API_KEY' in picked, false);
  });

  it('reads public config via named access when process.env cannot be enumerated', () => {
    const env = nonEnumerableEnv({
      NEXT_PUBLIC_SUPABASE_URL: DEVELOP_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      VERCEL_ENV: 'preview',
      SUPABASE_SERVICE_ROLE_KEY: 'must-not-throw-or-leak',
    });
    assert.throws(() => Object.entries(env), /not enumerable/);
    const config = getPublicSupabaseConfig(env);
    assert.equal(config.url, DEVELOP_URL);
    assert.equal(config.ref, 'bkwhqfkosxnoffpsjcug');
    assert.equal(config.anonKey, 'anon');
    assert.equal('SUPABASE_SERVICE_ROLE_KEY' in config, false);
  });

  it('falls back to parent URL when public URL env is blank, not throw', () => {
    const config = getPublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: '',
      SUPABASE_URL: '   ',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    });
    assert.equal(config.url, PARENT_URL);
    assert.equal(config.ref, 'krcwpupbdizzjyydzaqp');
  });

  it('tryGet returns ok:false instead of throwing on refused/incomplete lock', () => {
    const third = tryGetPublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: THIRD_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    });
    assert.equal(third.ok, false);
    assert.equal(third.config, null);
    assert.match(third.error, /Refused Supabase project ref/);

    const developInProd = tryGetPublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: DEVELOP_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      VERCEL_ENV: 'production',
    });
    assert.equal(developInProd.ok, false);
    assert.match(developInProd.error, /develop\/staging Supabase ref/);

    const ok = tryGetPublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: DEVELOP_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      VERCEL_ENV: 'preview',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.config.url, DEVELOP_URL);
  });

  it('does not ship root middleware (Vercel Node ESM cannot load next/server)', () => {
    assert.equal(existsSync(join(root, 'middleware.ts')), false);
    assert.equal(existsSync(join(root, 'middleware.js')), false);
    assert.equal(existsSync(join(root, 'src/middleware.ts')), false);
    assert.equal(existsSync(join(root, 'src/middleware.js')), false);

    const layout = read('app/layout.tsx');
    assert.equal(layout.includes('getPublicSupabaseConfig'), false);
  });
});
