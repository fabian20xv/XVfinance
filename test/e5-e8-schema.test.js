import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { E5_E8_TABLES } from '../src/db/smoke-ids.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260918230000_e5_e8_reports_imports_scratchpad.sql'),
  'utf8'
);

describe('CA-5–CA-8 schema migration (locked project)', () => {
  it('is pinned to krcwpupbdizzjyydzaqp', () => {
    assert.match(migration, /krcwpupbdizzjyydzaqp/);
    assert.match(migration, /https:\/\/krcwpupbdizzjyydzaqp\.supabase\.co/);
    assert.match(migration, /Never apply this migration to any other Supabase project/);
  });

  it('adds report sections without a public URL column', () => {
    assert.match(migration, /add column if not exists sections jsonb/);
    assert.match(migration, /Never create an anonymous public URL/);
    assert.doesNotMatch(migration, /add column if not exists public_url/);
  });

  it('creates watermarked scratchpads with firm-scoped RLS', () => {
    for (const table of E5_E8_TABLES) {
      assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
      assert.match(
        migration,
        new RegExp(`alter table public\\.${table} enable row level security`)
      );
    }
    assert.match(migration, /SCRATCHPAD — not live \/ not source of truth/);
    assert.match(migration, /scratchpads_insert_own/);
    assert.match(migration, /grant select, insert, update on table public\.scratchpads/);
  });

  it('creates a private firm-imports bucket with firm-prefix RLS', () => {
    assert.match(migration, /insert into storage\.buckets/);
    assert.match(migration, /'firm-imports'/);
    assert.match(migration, /false,\s+5242880/s);
    assert.match(migration, /private\.storage_object_firm_id/);
    assert.match(migration, /firm_imports_insert/);
    assert.match(migration, /split_part\(object_name, '\/', 1\)/);
  });

  it('applies report_publish, holdings_import, and scratchpad_promote', () => {
    assert.match(migration, /add value if not exists 'holdings_import'/);
    assert.match(migration, /add value if not exists 'scratchpad_promote'/);
    assert.match(migration, /unmatched symbols block confirm/);
    assert.match(migration, /p_create_missing_instruments boolean/);
    assert.match(migration, /status = 'published'::public\.report_status/);
    assert.doesNotMatch(migration, /report_publish apply is out of scope until E5/);
  });
});
