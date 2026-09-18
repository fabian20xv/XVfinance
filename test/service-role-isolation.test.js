import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { createChatToolRunner } from '../src/chat/tool-runner.js';
import { createUserScopedClient } from '../src/chat/user-client.js';
import { getPublicSupabaseConfig } from '../src/client/public-config.js';
import {
  assertNoServiceRoleEnv,
  assertNotServiceRoleClient,
  createChatToolEnv,
  isServiceRoleEnvKey,
  markServiceRoleClient,
} from '../src/security/service-role-guard.js';
import { createServiceRoleClient, getServiceRoleKey } from '../src/server/service-role.js';

const LOCKED_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const ROOT = join(import.meta.dirname, '..');
const SCAN_DIRS = ['src/chat', 'src/client', 'src/http'];
const FORBIDDEN_IN_CHAT_CLIENT = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'getServiceRoleKey',
  'createServiceRoleClient',
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (full.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

describe('CA-0.2 service-role key isolation', () => {
  it('recognizes service-role env keys including public-prefix leaks', () => {
    assert.equal(isServiceRoleEnvKey('SUPABASE_SERVICE_ROLE_KEY'), true);
    assert.equal(isServiceRoleEnvKey('SUPABASE_SECRET_KEY'), true);
    assert.equal(isServiceRoleEnvKey('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'), true);
    assert.equal(isServiceRoleEnvKey('VITE_SUPABASE_SERVICE_ROLE_KEY'), true);
    assert.equal(isServiceRoleEnvKey('SUPABASE_ANON_KEY'), false);
    assert.equal(isServiceRoleEnvKey('SUPABASE_URL'), false);
  });

  it('strips service-role secrets from the env handed to chat tools', () => {
    const isolated = createChatToolEnv({
      SUPABASE_URL: LOCKED_URL,
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-role',
      SUPABASE_SECRET_KEY: 'also-secret',
      NODE_ENV: 'test',
    });

    assert.equal(isolated.SUPABASE_URL, LOCKED_URL);
    assert.equal(isolated.SUPABASE_ANON_KEY, 'anon-key');
    assert.equal(isolated.NODE_ENV, 'test');
    assert.equal(isolated.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(isolated.SUPABASE_SECRET_KEY, undefined);
    assert.equal('SUPABASE_SERVICE_ROLE_KEY' in isolated, false);
    assert.throws(() => {
      isolated.SUPABASE_SERVICE_ROLE_KEY = 'leak';
    }, TypeError);
    assertNoServiceRoleEnv(isolated);
  });

  it('fails loud if a chat env still contains a service-role key', () => {
    assert.throws(
      () => assertNoServiceRoleEnv({ SUPABASE_SERVICE_ROLE_KEY: 'x' }),
      /not allowed in chat tool or client environment/
    );
  });

  it('chat tool runner never exposes the service-role key even when process.env has it', async () => {
    let seenEnv;
    const runner = createChatToolRunner({
      env: {
        SUPABASE_URL: LOCKED_URL,
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
      },
      createUserClient: (jwt, env) => {
        seenEnv = env;
        return { jwt, kind: 'user' };
      },
      tools: {
        ping: ({ env, client }) => ({
          hasServiceRole: 'SUPABASE_SERVICE_ROLE_KEY' in env,
          leakedValue: env.SUPABASE_SERVICE_ROLE_KEY,
          clientKind: client.kind,
        }),
      },
    });

    assert.equal('SUPABASE_SERVICE_ROLE_KEY' in runner.env, false);

    const result = await runner.run('ping', {}, { userJwt: 'user-jwt' });
    assert.equal(result.hasServiceRole, false);
    assert.equal(result.leakedValue, undefined);
    assert.equal(result.clientKind, 'user');
    assert.equal(seenEnv.SUPABASE_SERVICE_ROLE_KEY, undefined);
  });

  it('refuses to run chat tools without a user JWT', async () => {
    const runner = createChatToolRunner({
      env: { SUPABASE_URL: LOCKED_URL, SUPABASE_ANON_KEY: 'anon' },
      createUserClient: () => ({}),
      tools: { ping: () => 'ok' },
    });
    await assert.rejects(() => runner.run('ping', {}), /requires a user JWT/);
  });

  it('rejects a service-role client if one is handed to the runner', async () => {
    const admin = markServiceRoleClient({ kind: 'admin' });
    const runner = createChatToolRunner({
      env: { SUPABASE_URL: LOCKED_URL, SUPABASE_ANON_KEY: 'anon' },
      createUserClient: () => admin,
      tools: { ping: () => 'ok' },
    });
    await assert.rejects(
      () => runner.run('ping', {}, { userJwt: 'user-jwt' }),
      /cannot be used in chat tool context/
    );
  });

  it('user-scoped client uses the anon key plus user JWT, never the service-role key', () => {
    const calls = [];
    const client = createUserScopedClient(
      'user-jwt-token',
      {
        SUPABASE_URL: LOCKED_URL,
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'must-not-be-used',
      },
      (url, key, options) => {
        calls.push({ url, key, options });
        return { url, key };
      }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, LOCKED_URL);
    assert.equal(calls[0].key, 'anon-key');
    assert.notEqual(calls[0].key, 'must-not-be-used');
    assert.equal(calls[0].options.global.headers.Authorization, 'Bearer user-jwt-token');
    assertNotServiceRoleClient(client);
  });

  it('service-role client is marked and only created from the server module', () => {
    const client = createServiceRoleClient(
      {
        SUPABASE_URL: LOCKED_URL,
        SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
      },
      (url, key) => ({ url, key })
    );
    assert.equal(client.key, 'server-only-key');
    assert.throws(() => assertNotServiceRoleClient(client), /cannot be used in chat tool context/);
    assert.equal(getServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: 'server-only-key' }), 'server-only-key');
  });

  it('refuses placeholder service-role keys', () => {
    assert.throws(
      () => getServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: 'replace-with-service-role-key' }),
      /placeholder/
    );
  });

  it('client public config cannot carry a service-role key', () => {
    const config = getPublicSupabaseConfig({
      SUPABASE_URL: LOCKED_URL,
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'nope',
    });
    assert.equal(config.url, LOCKED_URL);
    assert.equal(config.anonKey, 'anon-key');
    assert.equal('SUPABASE_SERVICE_ROLE_KEY' in config, false);
  });

  it('source scan: chat, client, and http files never mention the service-role key', () => {
    const files = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)));
    assert.ok(files.length > 0, 'expected chat/client source files');

    const violations = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const token of FORBIDDEN_IN_CHAT_CLIENT) {
        if (source.includes(token)) {
          violations.push(`${relative(ROOT, file)} contains ${token}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });
});
