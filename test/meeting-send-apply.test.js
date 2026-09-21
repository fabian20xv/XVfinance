import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyConfirmedProposal, applyMeetingSend } from '../src/proposals/apply-meeting-send.js';
import { SMOKE_FIRM_ID, SMOKE_MEETING_REPORT_ID } from '../src/db/smoke-ids.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260921100000_meeting_send_apply.sql'),
  'utf8'
);

describe('BUG-F5 meeting_send confirm apply', () => {
  it('allowlists the meeting_send apply migration on develop and parent (not parent-only)', () => {
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

  it('wires meeting_send into apply_proposal_payload with the private helper', () => {
    assert.match(migration, /private\.apply_meeting_send/);
    assert.match(migration, /p\.kind::text = 'meeting_send'/);
    assert.match(migration, /apply_proposal_payload_except_meeting_send/);
    assert.match(migration, /apply E3–E9 first/);
    assert.match(migration, /revoke all on function private\.apply_meeting_send/);
    assert.match(migration, /Never create an anonymous public URL/);
  });

  it('applies a draft meeting 1-pager and fail-closes without mutating on error', () => {
    const reports = [
      {
        id: SMOKE_MEETING_REPORT_ID,
        firm_id: SMOKE_FIRM_ID,
        purpose: 'meeting_one_pager',
        status: 'draft',
        receipts: [{ citation: 'R1' }],
        sent_at: null,
        send_channel: null,
      },
    ];
    const proposal = {
      firm_id: SMOKE_FIRM_ID,
      kind: 'meeting_send',
      payload: {
        report_id: SMOKE_MEETING_REPORT_ID,
        channel: 'email',
        receipts: [{ citation: 'R1' }],
      },
    };

    const applied = applyMeetingSend({ proposal, reports, now: () => '2026-09-21T00:00:00.000Z' });
    assert.equal(applied.ok, true);
    assert.equal(reports[0].status, 'published');
    assert.equal(reports[0].sent_at, '2026-09-21T00:00:00.000Z');
    assert.equal(reports[0].send_channel, 'email');

    const failed = applyConfirmedProposal(
      { reports: [{ ...reports[0], status: 'published' }] },
      proposal,
      { status: 'confirmed' }
    );
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /not found or missing receipts/);
  });
});
