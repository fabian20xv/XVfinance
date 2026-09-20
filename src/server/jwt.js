/**
 * Verify a Supabase user access token for the locked XVfinance project only.
 * Service-role tokens are refused. Wrong-project issuers fail loud.
 *
 * Signing:
 * - HS256 (legacy shared secret): `SUPABASE_JWT_SECRET`
 * - ES256/RS256 (asymmetric, including develop JWKS): `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`
 * Jose key-type / alg mismatches fall through to Auth `GET /auth/v1/user`.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  ALLOWED_JWT_ISSUERS,
  assertAllowedJwtIssuer,
  assertAllowedSupabaseUrl,
  describeAllowedSupabaseProjects,
} from '../config/supabase-lock.js';
import { unauthorized } from './errors.js';

const remoteJwksByUrl = new Map();

function isPlaceholder(value) {
  return !value || /replace-with|changeme|placeholder/i.test(value);
}

function decodeJwtJsonPart(token, index, label) {
  const parts = String(token).split('.');
  if (parts.length !== 3) {
    throw unauthorized('Malformed JWT.', 'invalid_token');
  }
  try {
    const json = Buffer.from(parts[index], 'base64url').toString('utf8');
    const value = JSON.parse(json);
    if (!value || typeof value !== 'object') {
      throw new Error('not an object');
    }
    return value;
  } catch (err) {
    if (err && err.name === 'ApiError') {
      throw err;
    }
    throw unauthorized(`Malformed JWT ${label}.`, 'invalid_token');
  }
}

/**
 * Decode a JWT payload without verifying the signature.
 * Used only to fail loud on a wrong-project issuer before crypto.
 * @param {string} token
 */
export function decodeJwtPayload(token) {
  return decodeJwtJsonPart(token, 1, 'payload');
}

/**
 * Decode a JWT header without verifying the signature.
 * Used to choose HS256 (shared secret) vs ES256/RS256 (JWKS).
 * @param {string} token
 */
export function decodeJwtHeader(token) {
  return decodeJwtJsonPart(token, 0, 'header');
}

/**
 * Clear cached remote JWKS getters (tests).
 */
export function resetRemoteJwksCache() {
  remoteJwksByUrl.clear();
}

/**
 * @param {unknown} iss
 */
export function assertJwtIssuer(iss) {
  if (iss == null || String(iss).trim() === '') {
    throw unauthorized(
      `JWT missing issuer. Only ${describeAllowedSupabaseProjects()} are allowed.`,
      'wrong_project'
    );
  }

  try {
    return assertAllowedJwtIssuer(iss);
  } catch {
    throw unauthorized(
      `Refused JWT issuer "${iss}". Only ${describeAllowedSupabaseProjects()} are allowed.`,
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

function isAsymmetricAlg(alg) {
  if (typeof alg !== 'string') {
    return false;
  }
  return /^(?:ES|RS|PS)\d+$/i.test(alg.trim());
}

/**
 * Jose throws TypeError (not JOSEError) when an HS secret is used for ES256/RS256.
 * @param {unknown} err
 */
export function isJoseKeyTypeOrAlgMismatch(err) {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const code = 'code' in err ? err.code : undefined;
  if (code === 'ERR_JOSE_NOT_SUPPORTED' || code === 'ERR_JOSE_ALG_NOT_ALLOWED') {
    return true;
  }
  if ('claim' in err && err.claim === 'alg' && 'reason' in err && err.reason === 'mismatch') {
    return true;
  }
  const message = String('message' in err ? err.message : '');
  if (
    /Key for the \S+ algorithm must be /i.test(message) ||
    /Invalid key for this operation, its "alg"/i.test(message) ||
    /JSON Web Key for (?:symmetric algorithms|this operation)/i.test(message) ||
    /alg(?:orithm)? mismatch/i.test(message)
  ) {
    return true;
  }
  return false;
}

function remoteJwksFor(env) {
  const { url } = assertAllowedSupabaseUrl(env.SUPABASE_URL);
  const jwksUrl = `${url}/auth/v1/.well-known/jwks.json`;
  let jwks = remoteJwksByUrl.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    remoteJwksByUrl.set(jwksUrl, jwks);
  }
  return jwks;
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
    issuer: [...ALLOWED_JWT_ISSUERS],
  });
  return payload;
}

/**
 * @param {string} token
 * @param {NodeJS.ProcessEnv} env
 * @param {import('jose').JWTVerifyGetKey | Uint8Array | CryptoKey | undefined} jwks
 */
async function verifyWithJwks(token, env, jwks) {
  const key = jwks ?? remoteJwksFor(env);
  const { payload } = await jwtVerify(token, key, {
    issuer: [...ALLOWED_JWT_ISSUERS],
  });
  return payload;
}

/**
 * Auth-server verification (HS256 projects, and fallback after jose key-type / alg mismatch).
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
 * @param {string} token
 * @param {NodeJS.ProcessEnv} env
 * @param {import('jose').JWTVerifyGetKey | undefined} jwks
 */
async function verifyByAlg(token, env, jwks) {
  const header = decodeJwtHeader(token);
  if (isAsymmetricAlg(header.alg)) {
    return verifyWithJwks(token, env, jwks);
  }
  return verifyWithJwtSecret(token, env);
}

/**
 * @param {string | null | undefined} token
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(token: string) => Promise<Record<string, unknown>>} [options.verify]
 * @param {import('jose').JWTVerifyGetKey} [options.jwks]
 */
export async function verifySupabaseAccessToken(token, { env = process.env, verify, jwks } = {}) {
  if (token == null || String(token).trim() === '') {
    throw unauthorized('Missing bearer token.');
  }

  const trimmed = String(token).trim();
  const unverified = decodeJwtPayload(trimmed);
  assertJwtIssuer(unverified.iss);
  assertUserRole(unverified.role);

  let payload;
  try {
    if (verify) {
      payload = await verify(trimmed);
    } else {
      try {
        payload = await verifyByAlg(trimmed, env, jwks);
        if (payload == null) {
          payload = await verifyWithAuthServer(trimmed, env);
        }
      } catch (err) {
        if (err && err.name === 'ApiError') {
          throw err;
        }
        if (isJoseKeyTypeOrAlgMismatch(err)) {
          payload = await verifyWithAuthServer(trimmed, env);
        } else {
          throw err;
        }
      }
    }
  } catch (err) {
    if (err && err.name === 'ApiError') {
      throw err;
    }
    throw unauthorized(`Invalid or expired access token: ${err.message}`, 'invalid_token');
  }

  const project = assertJwtIssuer(payload.iss);
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
    issuer: project.jwtIssuer,
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
