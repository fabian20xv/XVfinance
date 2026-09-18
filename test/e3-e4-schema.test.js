import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { E3_TABLES } from '../src/db/smoke-ids.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260918220000_e3_e4_watchlists_proposals.sql'),
  'utf8'
);

describe('CA-3 / CA-4 schema migration (locked project)', () => {
  it('is pinned to krcwpupbdizzjyydzaqp', () => {
    assert.match(migration, /krcwpupbdizzjyydzaqp/);
    assert.match(migration, /https:\/\/krcwpupbdizzjyydzaqp\.supabase\.co/);
    assert.match(migration, /Never apply this migration to any other Supabase project/);
  });

  it('adds watchlists, watchlist_items, and workspace_focus with firm_id + RLS', () => {
    for (const table of E3_TABLES) {
      assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
      assert.match(
        migration,
        new RegExp(`alter table public\\.${table} enable row level security`)
      );
    }
    assert.match(migration, /watchlists_select_firm/);
    assert.match(migration, /workspace_focus_insert_own/);
    assert.doesNotMatch(migration, /grant insert, update on table public\.watchlists/);
    assert.doesNotMatch(migration, /grant insert, update on table public\.watchlist_items/);
    assert.match(migration, /grant select, insert, update on table public\.workspace_focus/);
  });

  it('adds proposal preview, expires_at, idempotency_key, expired status, watchlist_upsert', () => {
    assert.match(migration, /add value if not exists 'expired'/);
    assert.match(migration, /add value if not exists 'watchlist_upsert'/);
    assert.match(migration, /add column if not exists preview jsonb/);
    assert.match(migration, /add column if not exists expires_at timestamptz/);
    assert.match(migration, /add column if not exists idempotency_key text/);
    assert.match(migration, /proposal_confirm_role as enum \('any_member', 'manager'\)/);
    assert.match(migration, /proposals_firm_idempotency_key_idx/);
  });

  it('applies proposals as the confirming user via a private trigger', () => {
    assert.match(migration, /private\.apply_proposal_payload/);
    assert.match(migration, /private\.proposals_before_write/);
    assert.match(migration, /new\.status := 'applied'/);
    assert.match(migration, /security definer/);
    assert.match(migration, /revoke all on function private\.apply_proposal_payload/);
  });

  it('defaults note proposals to any_member and does not force manager-only', () => {
    assert.match(migration, /Notes confirm default: any_member/);
    assert.match(migration, /note_upsert'::public\.proposal_kind then/);
    assert.match(migration, /new\.requires_role := 'any_member'/);
    assert.match(migration, /new\.requires_manager := false/);
  });

  it('widens confirm WITH CHECK so the trigger may set applied/failed/expired', () => {
    assert.match(migration, /'applied'::public\.proposal_status/);
    assert.match(migration, /'expired'::public\.proposal_status/);
    assert.match(migration, /requires_role = 'manager'/);
    assert.match(migration, /proposals_update_expire/);
  });
});
