import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SMOKE_FIRM_ID, SMOKE_MANAGER_ID, SMOKE_PROPOSAL_ID } from '../src/db/smoke-ids.js';
import {
  completeToolSuccess,
  isProposalLifecycleAction,
} from '../src/server/tool-response.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260920210000_proposal_lifecycle_audit.sql'),
  'utf8'
);

const session = {
  userId: SMOKE_MANAGER_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'manager',
};

describe('BUG-2 proposal confirm/reject fail-closed audit', () => {
  it('allowlists the lifecycle audit migration on develop and parent (not parent-only)', () => {
    assert.match(migration, /bkwhqfkosxnoffpsjcug/);
    assert.match(migration, /https:\/\/bkwhqfkosxnoffpsjcug\.supabase\.co/);
    assert.match(migration, /krcwpupbdizzjyydzaqp/);
    assert.match(migration, /https:\/\/krcwpupbdizzjyydzaqp\.supabase\.co/);
    assert.match(migration, /Apply on the E0 allowlist only/);
    assert.match(migration, /refuse any third project/);
    assert.match(migration, /Not parent-only/);
    assert.doesNotMatch(migration, /Target ONLY https:\/\/krcwpupbdizzjyydzaqp/);
    assert.doesNotMatch(migration, /Never apply this migration to any other Supabase project/);
  });

  it('writes lifecycle audit_events in the same transaction as confirm/reject apply', () => {
    assert.match(migration, /private\.write_proposal_lifecycle_audit/);
    assert.match(migration, /proposals_lifecycle_audit/);
    assert.match(migration, /after update of status on public\.proposals/);
    assert.match(migration, /proposal\.applied/);
    assert.match(migration, /proposal\.rejected/);
    assert.match(migration, /insert into public\.audit_events/);
    assert.match(migration, /security definer/);
    assert.match(migration, /rolling back confirm\/reject/);
    assert.match(migration, /revoke all on function private\.write_proposal_lifecycle_audit/);
  });

  it('names lifecycle actions consistently', () => {
    assert.equal(isProposalLifecycleAction('proposal.applied'), true);
    assert.equal(isProposalLifecycleAction('proposal.rejected'), true);
    assert.equal(isProposalLifecycleAction('proposal.confirmed'), true);
    assert.equal(isProposalLifecycleAction('session.read'), false);
  });

  it('happy path writes audit and returns 200 with audit_id', async () => {
    const writes = [];
    const completed = await completeToolSuccess({
      session,
      result: {
        ok: true,
        data: { id: SMOKE_PROPOSAL_ID, status: 'confirmed', db_status: 'applied' },
        audit: {
          action: 'proposal.applied',
          entityTable: 'proposals',
          entityId: SMOKE_PROPOSAL_ID,
          sensitive: true,
        },
      },
      writeAudit: async (event) => {
        writes.push(event);
        return 'audit-happy';
      },
    });

    assert.equal(completed.status, 200);
    assert.equal(completed.body.ok, true);
    assert.equal(completed.body.data.db_status, 'applied');
    assert.equal(completed.body.audit_id, 'audit-happy');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].action, 'proposal.applied');
    assert.equal(writes[0].firmId, SMOKE_FIRM_ID);
    assert.equal(writes[0].entityId, SMOKE_PROPOSAL_ID);
  });

  it('returns 200 with the applied result when HTTP audit fails after mutate', async () => {
    const completed = await completeToolSuccess({
      session,
      result: {
        ok: true,
        data: { id: SMOKE_PROPOSAL_ID, status: 'confirmed', db_status: 'applied' },
        audit: {
          action: 'proposal.applied',
          entityTable: 'proposals',
          entityId: SMOKE_PROPOSAL_ID,
          sensitive: true,
        },
      },
      writeAudit: async () => {
        throw new Error('audit write failed: SUPABASE_SERVICE_ROLE_KEY is missing');
      },
    });

    assert.equal(completed.status, 200);
    assert.equal(completed.body.ok, true);
    assert.equal(completed.body.data.db_status, 'applied');
    assert.equal(completed.body.audit_id, undefined);
  });

  it('returns 200 with the rejected result when HTTP audit fails after mutate', async () => {
    const completed = await completeToolSuccess({
      session,
      result: {
        ok: true,
        data: { id: SMOKE_PROPOSAL_ID, status: 'rejected', db_status: 'rejected' },
        audit: {
          action: 'proposal.rejected',
          entityTable: 'proposals',
          entityId: SMOKE_PROPOSAL_ID,
          sensitive: true,
        },
      },
      writeAudit: async () => {
        throw new Error('audit write failed: missing id');
      },
    });

    assert.equal(completed.status, 200);
    assert.equal(completed.body.ok, true);
    assert.equal(completed.body.data.status, 'rejected');
  });

  it('still fails loud when a non-lifecycle audit write fails', async () => {
    await assert.rejects(
      () =>
        completeToolSuccess({
          session,
          result: {
            ok: true,
            data: { user_id: SMOKE_MANAGER_ID },
            audit: { action: 'session.read', entityTable: 'firm_members' },
          },
          writeAudit: async () => {
            throw new Error('audit write failed: missing id');
          },
        }),
      /audit write failed/
    );
  });
});
