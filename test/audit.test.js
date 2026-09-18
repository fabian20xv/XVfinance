import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SMOKE_FIRM_ID, SMOKE_MANAGER_ID } from '../src/db/smoke-ids.js';
import { proposalAuditAction, redactAuditPayload, writeAuditEvent } from '../src/server/audit.js';

describe('CA-2.3 audit writer', () => {
  it('inserts a firm-scoped audit_events row and returns the id', async () => {
    const inserted = [];
    const auditId = await writeAuditEvent({
      firmId: SMOKE_FIRM_ID,
      actorId: SMOKE_MANAGER_ID,
      action: 'session.read',
      entityTable: 'firm_members',
      entityId: SMOKE_MANAGER_ID,
      payload: { role: 'manager', authorization: 'Bearer secret', token: 'jwt' },
      createAdmin: () => ({
        from(table) {
          assert.equal(table, 'audit_events');
          return {
            insert(row) {
              inserted.push(row);
              return {
                select() {
                  return {
                    async single() {
                      return { data: { id: 'audit-row-1' }, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      }),
    });

    assert.equal(auditId, 'audit-row-1');
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].firm_id, SMOKE_FIRM_ID);
    assert.equal(inserted[0].actor_id, SMOKE_MANAGER_ID);
    assert.equal(inserted[0].action, 'session.read');
    assert.equal(inserted[0].payload.authorization, '[redacted]');
    assert.equal(inserted[0].payload.token, '[redacted]');
    assert.equal(inserted[0].payload.role, 'manager');
  });

  it('fails loud without firm_id', async () => {
    await assert.rejects(
      () => writeAuditEvent({ action: 'session.read', createAdmin: () => ({}) }),
      /firm_id is required/
    );
  });

  it('names proposal lifecycle actions consistently', () => {
    assert.equal(proposalAuditAction('confirmed'), 'proposal.confirmed');
    assert.equal(proposalAuditAction('rejected'), 'proposal.rejected');
    assert.equal(proposalAuditAction('applied'), 'proposal.applied');
  });

  it('redacts nested secrets', () => {
    const redacted = redactAuditPayload({ outer: { service_role: 'x', ok: 1 } });
    assert.equal(redacted.outer.service_role, '[redacted]');
    assert.equal(redacted.outer.ok, 1);
  });
});
