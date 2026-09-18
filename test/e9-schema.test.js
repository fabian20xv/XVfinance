import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260918240000_e9_meeting_ghostwriter.sql'),
  'utf8'
);

describe('CA-9 schema migration (locked project)', () => {
  it('is pinned to krcwpupbdizzjyydzaqp', () => {
    assert.match(migration, /krcwpupbdizzjyydzaqp/);
    assert.match(migration, /https:\/\/krcwpupbdizzjyydzaqp\.supabase\.co/);
    assert.match(migration, /Never apply this migration to any other Supabase project/);
  });

  it('adds meeting_send and report receipt/send columns', () => {
    assert.match(migration, /add value if not exists 'meeting_send'/);
    assert.match(migration, /add column if not exists receipts jsonb/);
    assert.match(migration, /add column if not exists sent_at timestamptz/);
    assert.match(migration, /meeting_one_pager/);
    assert.match(migration, /Never create an anonymous public URL/);
  });

  it('applies meeting_send via a private helper', () => {
    assert.match(migration, /private\.apply_meeting_send/);
    assert.match(migration, /p\.kind = 'meeting_send'/);
    assert.match(migration, /revoke all on function private\.apply_meeting_send/);
  });
});
