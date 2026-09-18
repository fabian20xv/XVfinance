import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SMOKE_ANALYST_ID, SMOKE_FIRM_ID, SMOKE_MANAGER_ID } from '../src/db/smoke-ids.js';
import { attachFirmContext } from '../src/server/session.js';

describe('CA-2.1 firm context from firm_members', () => {
  it('attaches user_id, firm_id, and manager role', async () => {
    const session = await attachFirmContext({
      userId: SMOKE_MANAGER_ID,
      userJwt: 'user-jwt',
      lookupMembers: async () => [
        { firm_id: SMOKE_FIRM_ID, role: 'manager', user_id: SMOKE_MANAGER_ID },
      ],
    });
    assert.deepEqual(session, {
      userId: SMOKE_MANAGER_ID,
      firmId: SMOKE_FIRM_ID,
      role: 'manager',
    });
  });

  it('attaches analyst role', async () => {
    const session = await attachFirmContext({
      userId: SMOKE_ANALYST_ID,
      userJwt: 'user-jwt',
      lookupMembers: async () => [
        { firm_id: SMOKE_FIRM_ID, role: 'analyst', user_id: SMOKE_ANALYST_ID },
      ],
    });
    assert.equal(session.role, 'analyst');
    assert.equal(session.firmId, SMOKE_FIRM_ID);
  });

  it('fails when the user has no membership', async () => {
    await assert.rejects(
      () =>
        attachFirmContext({
          userId: SMOKE_MANAGER_ID,
          userJwt: 'user-jwt',
          lookupMembers: async () => [],
        }),
      /No firm membership/
    );
  });

  it('fails when X-Firm-Id is a firm the user does not belong to', async () => {
    await assert.rejects(
      () =>
        attachFirmContext({
          userId: SMOKE_MANAGER_ID,
          userJwt: 'user-jwt',
          preferredFirmId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          lookupMembers: async () => [
            { firm_id: SMOKE_FIRM_ID, role: 'manager', user_id: SMOKE_MANAGER_ID },
          ],
        }),
      /Not a member of the requested firm/
    );
  });
});
