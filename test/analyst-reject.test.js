import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { roleCanConfirm, roleCanReject } from '../src/proposals/defaults.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260921140000_analyst_reject_manager_gated.sql'),
  'utf8'
);

describe('P1 analyst dismiss/reject on manager-gated proposals', () => {
  it('allowlists the analyst-reject migration on develop and parent (not parent-only)', () => {
    assert.match(migration, /bkwhqfkosxnoffpsjcug/);
    assert.match(migration, /https:\/\/bkwhqfkosxnoffpsjcug\.supabase\.co/);
    assert.match(migration, /krcwpupbdizzjyydzaqp/);
    assert.match(migration, /https:\/\/krcwpupbdizzjyydzaqp\.supabase\.co/);
    assert.match(migration, /Matching migration for BOTH/);
    assert.match(migration, /refuse any third project/);
    assert.match(migration, /Not parent-only/);
    assert.doesNotMatch(migration, /Target ONLY https:\/\/krcwpupbdizzjyydzaqp/);
    assert.doesNotMatch(migration, /Never apply this migration to any other Supabase project/);
  });

  it('lets any firm member reject without weakening manager-only confirm/apply', () => {
    assert.match(migration, /proposals_update_reject/);
    assert.match(migration, /any firm member \(analyst or manager\)/);
    assert.match(migration, /status = 'rejected'::public\.proposal_status/);
    assert.match(migration, /manager role required to confirm this proposal/);
    assert.doesNotMatch(
      migration,
      /manager role required to reject this proposal/
    );
    assert.match(migration, /private\.apply_proposal_payload/);
    assert.match(migration, /new\.status := 'applied'/);
  });

  it('keeps confirm manager-gated and reject open to analyst', () => {
    assert.equal(roleCanConfirm('analyst', 'manager'), false);
    assert.equal(roleCanConfirm('manager', 'manager'), true);
    assert.equal(roleCanReject('analyst'), true);
    assert.equal(roleCanReject('manager'), true);
    assert.equal(roleCanReject('guest'), false);
  });
});
