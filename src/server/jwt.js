/**
 * Verify a Supabase user access token for the locked XVfinance project only.
 * Service-role tokens are refused. Wrong-project issuers fail loud.
 */
import { jwtVerify } from 'jose';
import {
  ALLOWED_JWT_ISSUER,
  ALLOWED_SUPABASE_HOST,
  ALLOWED_SUPABASE_PROJECT_REF,
  ALLOWED_SUPABASE_URL,
  assertAllowedSupabaseUrl,
} from '../config/supabase-lock.js';
import { unauthorized } from './errors.js';

function isPlaceholder(value) {
  return !value || /replace-with|changeme|placeholder/i.test(value);
}

/**
 * Decode a JWT payload without verifying the signature.
 * Used only to fail loud on a wrong-project issuer before crypto.
 * @param {string} token
 */
export function decodeJwtPayload(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) {
    throw unauthorized('Malformed JWT.', 'invalid_token');
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json);
    if (!payload || typeof payload !== 'object') {
      throw new Error('not an object');
    }
    return payload;
  } catch {
    throw unauthorized('Malformed JWT payload.', 'invalid_token');
  }
}

/**
 * @param {unknown} iss
 */
export function assertJwtIssuer(iss) {
  if (iss == null || String(iss).trim() === '') {
    throw unauthorized(
      `JWT missing issuer. Only ${ALLOWED_JWT_ISSUER} (ref ${ALLOWED_SUPABASE_PROJECT_REF}) is allowed.`,
      'wrong_project'
    );
  }

  let parsed;
  try {
    parsed = new URL(String(iss).trim());
  } catch {
    throw unauthorized(
      `JWT issuer is not a valid URL: ${iss}. Only ${ALLOWED_JWT_ISSUER} is allowed.`,
      'wrong_project'
    );
  }

  if (parsed.protocol !== 'https:') {
    throw unauthorized(`JWT issuer must use https (${iss}).`, 'wrong_project');
  }

  if (parsed.hostname.toLowerCase() !== ALLOWED_SUPABASE_HOST) {
    throw unauthorized(
      `Refused JWT issuer host "${parsed.hostname}". Only ${ALLOWED_SUPABASE_HOST} (ref ${ALLOWED_SUPABASE_PROJECT_REF}) is allowed.`,
      'wrong_project'
    );
  }

  if (parsed.origin.toLowerCase() !== ALLOWED_SUPABASE_URL) {
    throw unauthorized(
      `Refused JWT issuer origin "${parsed.origin}". Only ${ALLOWED_SUPABASE_URL} is allowed.`,
      'wrong_project'
    );
  }
}

function assertUserRole(role) {
  if (role === 'service_role' || role === 'supabase_admin') {
    throw unauthorized(
      'Service-role tokens are not accepted. Chat tools and the API require a user JWT so RLS applies.',
      'service_role_token'
    );
  }
}

function audienceAllowsAuthenticated(aud) {
  if (aud == null) {
    return true;
  }
  const list = Array.isArray(aud) ? aud : [aud];
  return list.includes('authenticated');
}

/**
 * @param {string} token
 * @param {NodeJS.ProcessEnv} env
 */
async function verifyWithJwtSecret(token, env) {
  const secret = env.SUPABASE_JWT_SECRET;
  if (isPlaceholder(secret)) {
    return null;
  }
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    issuer: ALLOWED_JWT_ISSUER,
  });
  return payload;
}

/**
 * Auth-server verification for HS256 projects (documented Supabase path).
 * @param {string} token
 * @param {NodeJS.ProcessEnv} env
 */
async function verifyWithAuthServer(token, env) {
  const { url } = assertAllowedSupabaseUrl(env.SUPABASE_URL);
  const anon = env.SUPABASE_ANON_KEY;
  if (isPlaceholder(anon)) {
    throw unauthorized(
      'Cannot verify JWT: set SUPABASE_JWT_SECRET or SUPABASE_ANON_KEY on the server.',
      'unauthenticated'
    );
  }

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw unauthorized('Invalid or expired access token.', 'invalid_token');
  }

  return decodeJwtPayload(token);
}

/**
 * @param {string | null | undefined} token
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(token: string) => Promise<Record<string, unknown>>} [options.verify]
 */
export async function verifySupabaseAccessToken(token, { env = process.env, verify } = {}) {
  if (token == null || String(token).trim() === '') {
    throw unauthorized('Missing bearer token.');
  }

  const trimmed = String(token).trim();
  const unverified = decodeJwtPayload(trimmed);
  assertJwtIssuer(unverified.iss);
  assertUserRole(unverified.role);

  let payload;
  try {
    payload = verify ? await verify(trimmed) : (await verifyWithJwtSecret(trimmed, env)) ?? (await verifyWithAuthServer(trimmed, env));
  } catch (err) {
    if (err && err.name === 'ApiError') {
      throw err;
    }
    throw unauthorized(`Invalid or expired access token: ${err.message}`, 'invalid_token');
  }

  assertJwtIssuer(payload.iss);
  assertUserRole(payload.role);

  if (!audienceAllowsAuthenticated(payload.aud)) {
    throw unauthorized('JWT audience must include "authenticated".', 'invalid_token');
  }

  const userId = payload.sub;
  if (!userId || typeof userId !== 'string') {
    throw unauthorized('JWT is missing sub (user id).', 'invalid_token');
  }

  return Object.freeze({
    userId,
    claims: payload,
    issuer: ALLOWED_JWT_ISSUER,
  });
}

/**
 * @param {string | null | undefined} header
 */
export function bearerTokenFromHeader(header) {
  if (header == null || header === '') {
    return null;
  }
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : String(header).trim();
}
