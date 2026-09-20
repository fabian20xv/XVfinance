import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SignJWT } from 'jose';
import { ALLOWED_JWT_ISSUER } from '../src/config/supabase-lock.js';
import { ApiError } from '../src/server/errors.js';
import { decodeJwtPayload, verifySupabaseAccessToken } from '../src/server/jwt.js';

const SECRET = 'xvfinance-test-jwt-secret-32chars!';
const USER_ID = 'a0000000-0000-4000-8000-0000000000aa';

async function mint(overrides = {}) {
  const {
    issuer = ALLOWED_JWT_ISSUER,
    role = 'authenticated',
    sub = USER_ID,
    aud = 'authenticated',
    secret = SECRET,
    expired = false,
  } = overrides;

  let builder = new SignJWT({ role, aud })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setSubject(sub)
    .setIssuedAt();

  builder = expired ? builder.setExpirationTime('0s') : builder.setExpirationTime('10m');
  return builder.sign(new TextEncoder().encode(secret));
}

const env = {
  SUPABASE_URL: 'https://krcwpupbdizzjyydzaqp.supabase.co',
  SUPABASE_JWT_SECRET: SECRET,
};

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
    const developIssuer = 'https://bkwhqfkosxnoffpsjcug.supabase.co/auth/v1';
    const token = await mint({ issuer: developIssuer });
    const result = await verifySupabaseAccessToken(token, {
      env: {
        SUPABASE_URL: 'https://bkwhqfkosxnoffpsjcug.supabase.co',
        SUPABASE_JWT_SECRET: SECRET,
      },
    });
    assert.equal(result.userId, USER_ID);
    assert.equal(result.issuer, developIssuer);
  });
});
