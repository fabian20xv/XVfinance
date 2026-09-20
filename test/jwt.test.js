import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { ALLOWED_JWT_ISSUER } from '../src/config/supabase-lock.js';
import { ApiError } from '../src/server/errors.js';
import {
  decodeJwtHeader,
  decodeJwtPayload,
  isJoseKeyTypeOrAlgMismatch,
  resetRemoteJwksCache,
  verifySupabaseAccessToken,
} from '../src/server/jwt.js';

const SECRET = 'xvfinance-test-jwt-secret-32chars!';
const USER_ID = 'a0000000-0000-4000-8000-0000000000aa';
const PARENT_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const DEVELOP_URL = 'https://bkwhqfkosxnoffpsjcug.supabase.co';
const DEVELOP_ISSUER = `${DEVELOP_URL}/auth/v1`;
const DEVELOP_JWKS_URL = `${DEVELOP_URL}/auth/v1/.well-known/jwks.json`;
const DEVELOP_USER_URL = `${DEVELOP_URL}/auth/v1/user`;

async function mint(overrides = {}) {
  const {
    issuer = ALLOWED_JWT_ISSUER,
    role = 'authenticated',
    sub = USER_ID,
    aud = 'authenticated',
    secret = SECRET,
    expired = false,
    alg = 'HS256',
    kid,
    key,
  } = overrides;

  let builder = new SignJWT({ role, aud })
    .setProtectedHeader({ alg, typ: 'JWT', ...(kid ? { kid } : {}) })
    .setIssuer(issuer)
    .setSubject(sub)
    .setIssuedAt();

  builder = expired ? builder.setExpirationTime('0s') : builder.setExpirationTime('10m');
  const signingKey = key ?? new TextEncoder().encode(secret);
  return builder.sign(signingKey);
}

async function mintEs256(overrides = {}) {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = overrides.kid ?? 'develop-es256';
  jwk.alg = 'ES256';
  jwk.use = 'sig';
  const token = await mint({
    issuer: DEVELOP_ISSUER,
    alg: 'ES256',
    kid: jwk.kid,
    key: privateKey,
    ...overrides,
  });
  return { token, jwk, publicKey, privateKey };
}

const env = {
  SUPABASE_URL: PARENT_URL,
  SUPABASE_JWT_SECRET: SECRET,
};

const developEnv = {
  SUPABASE_URL: DEVELOP_URL,
  SUPABASE_JWT_SECRET: SECRET,
  SUPABASE_ANON_KEY: 'develop-anon-key',
};

function stubFetch({ jwks, userStatus = 200 } = {}) {
  const previous = globalThis.fetch;
  const calls = { jwks: 0, user: 0, urls: [] };
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    calls.urls.push(url);
    if (url === DEVELOP_JWKS_URL) {
      calls.jwks += 1;
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === DEVELOP_USER_URL) {
      calls.user += 1;
      const headers = init?.headers ?? {};
      const authorization = headers.Authorization ?? headers.authorization;
      assert.match(String(authorization), /^Bearer /);
      return new Response(JSON.stringify({ id: USER_ID }), { status: userStatus });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = previous;
    },
  };
}

afterEach(() => {
  resetRemoteJwksCache();
});

describe('CA-2.1 JWT verification', () => {
  it('fails loud when the bearer token is missing', async () => {
    await assert.rejects(() => verifySupabaseAccessToken('', { env }), (err) => {
      assert.equal(err.status, 401);
      assert.match(err.message, /Missing bearer token/);
      return true;
    });
  });

  it('fails loud for a JWT issued by another Supabase project', async () => {
    const token = await mint({ issuer: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1' });
    await assert.rejects(() => verifySupabaseAccessToken(token, { env }), (err) => {
      assert.equal(err instanceof ApiError, true);
      assert.equal(err.code, 'wrong_project');
      assert.match(err.message, /abcdefghijklmnopqrst|krcwpupbdizzjyydzaqp/);
      return true;
    });
  });

  it('refuses service-role tokens even when the issuer is locked', async () => {
    const token = await mint({ role: 'service_role' });
    await assert.rejects(() => verifySupabaseAccessToken(token, { env }), (err) => {
      assert.equal(err.code, 'service_role_token');
      return true;
    });
  });

  it('rejects an invalid signature', async () => {
    const token = await mint({ secret: 'some-other-secret-that-is-not-ours!!!!' });
    await assert.rejects(() => verifySupabaseAccessToken(token, { env }), (err) => {
      assert.equal(err.status, 401);
      assert.match(err.message, /Invalid or expired/);
      return true;
    });
  });

  it('accepts a user JWT for krcwpupbdizzjyydzaqp and returns user_id', async () => {
    const token = await mint();
    const result = await verifySupabaseAccessToken(token, { env });
    assert.equal(result.userId, USER_ID);
    assert.equal(result.issuer, ALLOWED_JWT_ISSUER);
    assert.equal(decodeJwtPayload(token).iss, ALLOWED_JWT_ISSUER);
  });

  it('accepts a user JWT issued by the develop/staging project', async () => {
    const token = await mint({ issuer: DEVELOP_ISSUER });
    const result = await verifySupabaseAccessToken(token, {
      env: {
        SUPABASE_URL: DEVELOP_URL,
        SUPABASE_JWT_SECRET: SECRET,
      },
    });
    assert.equal(result.userId, USER_ID);
    assert.equal(result.issuer, DEVELOP_ISSUER);
  });

  it('verifies HS256 with SUPABASE_JWT_SECRET and does not fetch JWKS', async () => {
    const token = await mint();
    const fetchStub = stubFetch({ jwks: { keys: [] } });
    try {
      const result = await verifySupabaseAccessToken(token, { env: { ...env, SUPABASE_ANON_KEY: 'anon' } });
      assert.equal(result.userId, USER_ID);
      assert.equal(fetchStub.calls.jwks, 0);
      assert.equal(fetchStub.calls.user, 0);
    } finally {
      fetchStub.restore();
    }
  });

  it('verifies develop ES256 access tokens via JWKS when a JWT secret is also set', async () => {
    const { token, jwk } = await mintEs256();
    assert.equal(decodeJwtHeader(token).alg, 'ES256');
    const fetchStub = stubFetch({ jwks: { keys: [jwk] } });
    try {
      const result = await verifySupabaseAccessToken(token, { env: developEnv });
      assert.equal(result.userId, USER_ID);
      assert.equal(result.issuer, DEVELOP_ISSUER);
      assert.equal(fetchStub.calls.jwks, 1);
      assert.equal(fetchStub.calls.user, 0);
      assert.equal(fetchStub.calls.urls[0], DEVELOP_JWKS_URL);
    } finally {
      fetchStub.restore();
    }
  });

  it('falls through to Auth server verify on jose key-type mismatch', async () => {
    const { token } = await mintEs256();
    const tessError = new TypeError(
      'Key for the ES256 algorithm must be one of type CryptoKey, KeyObject, or JSON Web Key. Received an instance of Uint8Array'
    );
    assert.equal(isJoseKeyTypeOrAlgMismatch(tessError), true);

    const fetchStub = stubFetch({ jwks: { keys: [] } });
    try {
      const result = await verifySupabaseAccessToken(token, {
        env: developEnv,
        jwks: async () => {
          throw tessError;
        },
      });
      assert.equal(result.userId, USER_ID);
      assert.equal(result.issuer, DEVELOP_ISSUER);
      assert.equal(fetchStub.calls.user, 1);
      assert.equal(fetchStub.calls.jwks, 0);
    } finally {
      fetchStub.restore();
    }
  });

  it('does not fall through to Auth server for an invalid ES256 signature', async () => {
    const { jwk } = await mintEs256();
    const other = await generateKeyPair('ES256');
    const token = await mint({
      issuer: DEVELOP_ISSUER,
      alg: 'ES256',
      kid: jwk.kid,
      key: other.privateKey,
    });
    const fetchStub = stubFetch({ jwks: { keys: [jwk] } });
    try {
      await assert.rejects(() => verifySupabaseAccessToken(token, { env: developEnv }), (err) => {
        assert.equal(err.status, 401);
        assert.match(err.message, /Invalid or expired/);
        return true;
      });
      assert.equal(fetchStub.calls.jwks, 1);
      assert.equal(fetchStub.calls.user, 0);
    } finally {
      fetchStub.restore();
    }
  });
});
