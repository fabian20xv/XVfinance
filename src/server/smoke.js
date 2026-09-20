/**
 * Staging smoke probe.
 *
 * Uses the user-JWT (RLS) client only. Never reads or logs the service-role key.
 * Disabled in production (APP_ENV/VERCEL_ENV).
 */
import { timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createUserScopedClient } from '../chat/user-client.js';
import { createChatToolEnv } from '../security/service-role-guard.js';
import { boot } from '../config/startup.js';

const TABLE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;
const SELECT_IDENT = /^[a-zA-Z_*][a-zA-Z0-9_,\s*]*$/;

function roundMs(started) {
  return Math.round((performance.now() - started) * 1000) / 1000;
}

function redact(message) {
  return String(message)
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
    .replace(/service[_-]?role[^\s]*/gi, '[redacted]');
}

function smokeSecretMatches(provided, expected) {
  if (typeof expected !== 'string' || expected.length === 0) {
    return false;
  }
  if (typeof provided !== 'string') {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function authorizeSmokeRequest(req, env) {
  const expected = env.SMOKE_SECRET;
  if (typeof expected !== 'string' || expected.trim() === '') {
    return { ok: false, status: 401, error: 'smoke is not configured' };
  }
  const provided = req.headers['x-smoke-secret'];
  const header = Array.isArray(provided) ? provided[0] : provided;
  if (!smokeSecretMatches(header, expected)) {
    return { ok: false, status: 401, error: 'invalid smoke secret' };
  }
  return { ok: true };
}

async function timed(name, fn) {
  const started = performance.now();
  try {
    const result = await fn();
    return {
      name,
      ok: result.ok !== false,
      ms: roundMs(started),
      ...result,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      ms: roundMs(started),
      error: redact(err?.message || 'step failed'),
    };
  }
}

async function runAuthStep(env, createUserClient) {
  const jwt = typeof env.SMOKE_USER_JWT === 'string' ? env.SMOKE_USER_JWT.trim() : '';
  if (!jwt) {
    return { ok: true, skipped: true, reason: 'SMOKE_USER_JWT not set' };
  }

  const isolatedEnv = createChatToolEnv(env);
  const client = createUserClient(jwt, isolatedEnv);
  if (client?.auth?.getUser) {
    const { data, error } = await client.auth.getUser(jwt);
    if (error) {
      throw error;
    }
    return { ok: true, skipped: false, authenticated: Boolean(data?.user) };
  }

  return { ok: true, skipped: false, authenticated: true };
}

async function runDbStep(env, createUserClient) {
  const table = typeof env.SMOKE_DB_TABLE === 'string' ? env.SMOKE_DB_TABLE.trim() : '';
  if (!table) {
    return { ok: true, skipped: true, reason: 'SMOKE_DB_TABLE not set' };
  }

  const jwt = typeof env.SMOKE_USER_JWT === 'string' ? env.SMOKE_USER_JWT.trim() : '';
  if (!jwt) {
    return {
      ok: true,
      skipped: true,
      reason: 'SMOKE_USER_JWT not set; RLS read requires a user JWT',
    };
  }

  if (!TABLE_IDENT.test(table)) {
    return { ok: false, skipped: false, reason: 'SMOKE_DB_TABLE is not a safe identifier' };
  }

  const selectRaw = typeof env.SMOKE_DB_SELECT === 'string' ? env.SMOKE_DB_SELECT.trim() : 'id';
  const select = selectRaw || 'id';
  if (!SELECT_IDENT.test(select)) {
    return { ok: false, skipped: false, reason: 'SMOKE_DB_SELECT is not a safe column list' };
  }

  const isolatedEnv = createChatToolEnv(env);
  const client = createUserClient(jwt, isolatedEnv);
  if (typeof client?.from !== 'function') {
    throw new Error('user JWT client does not support from()');
  }

  const { data, error } = await client.from(table).select(select).limit(1);
  if (error) {
    throw error;
  }

  return {
    ok: true,
    skipped: false,
    rows: Array.isArray(data) ? data.length : 0,
  };
}

/**
 * @param {object} options
 * @param {NodeJS.ProcessEnv} options.env
 * @param {(jwt: string, env: Record<string, string | undefined>) => object} [options.createUserClient]
 */
export async function runSmoke({ env, createUserClient = createUserScopedClient } = {}) {
  const bootStep = await timed('boot', async () => {
    const locked = boot(env);
    return { ok: true, supabaseRef: locked.ref };
  });

  const authStep = await timed('auth', () => runAuthStep(env, createUserClient));
  const dbStep = await timed('db', () => runDbStep(env, createUserClient));
  const steps = [bootStep, authStep, dbStep];
  const ok = steps.every((step) => step.ok);

  return {
    ok,
    steps,
    supabaseRef: bootStep.supabaseRef,
  };
}
