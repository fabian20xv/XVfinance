import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DOMAIN_TABLES,
  FIRM_ROLES,
  SMOKE_FIRM_NAME,
  TENANCY_TABLES,
} from '../src/db/smoke-ids.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260918213000_e1_schema_rls.sql'),
  'utf8'
);

describe('CA-1.1–CA-1.5 schema migration (locked project)', () => {
  it('is pinned to krcwpupbdizzjyydzaqp and refuses other targets in comments', () => {
    assert.match(migration, /krcwpupbdizzjyydzaqp/);
    assert.match(migration, /https:\/\/krcwpupbdizzjyydzaqp\.supabase\.co/);
    assert.match(migration, /Never apply this migration to any other Supabase project/);
  });

  it('creates core tenancy tables with manager | analyst roles', () => {
    for (const table of TENANCY_TABLES) {
      assert.match(migration, new RegExp(`create table public\\.${table}`));
    }
    for (const role of FIRM_ROLES) {
      assert.match(migration, new RegExp(`'${role}'`));
    }
    assert.match(migration, /create type public\.firm_role as enum/);
  });

  it('creates every domain table with firm_id', () => {
    for (const table of DOMAIN_TABLES) {
      assert.match(migration, new RegExp(`create table public\\.${table}`));
      const blockStart = migration.indexOf(`create table public.${table}`);
      assert.ok(blockStart >= 0, table);
      const block = migration.slice(blockStart, blockStart + 1200);
      assert.match(block, /firm_id uuid not null/, `${table} missing firm_id`);
    }
  });

  it('adds CA-1.5 cash and liquidity columns on portfolios', () => {
    assert.match(migration, /cash_balance numeric\(20, 4\)/);
    assert.match(migration, /liquidity_available numeric\(20, 4\)/);
    assert.match(migration, /liquidity_buffer numeric\(20, 4\)/);
    assert.match(migration, /cash_currency text not null default 'USD'/);
  });

  it('enables RLS and firm-scoped select on tenant tables', () => {
    const tables = [...TENANCY_TABLES, ...DOMAIN_TABLES];
    for (const table of tables) {
      assert.match(
        migration,
        new RegExp(`alter table public\\.${table} enable row level security`)
      );
    }
    assert.match(migration, /clients_select_firm/);
    assert.match(migration, /private\.is_firm_member\(firm_id\)/);
    assert.match(migration, /MVP: all members read all firm clients/);
  });

  it('blocks direct client writes to high-PII, holdings, and notes', () => {
    assert.match(migration, /grant select on table public\.clients to authenticated/);
    assert.doesNotMatch(migration, /grant insert, update on table public\.clients/);
    assert.doesNotMatch(migration, /grant insert, update on table public\.holdings/);
    assert.doesNotMatch(migration, /grant insert, update on table public\.contacts/);
    assert.doesNotMatch(migration, /grant insert, update on table public\.notes/);
    assert.match(migration, /grant insert, update on table public\.proposals to authenticated/);
  });

  it('gates proposal confirm on manager vs analyst', () => {
    assert.match(migration, /proposals_update_confirm/);
    assert.match(migration, /private\.is_firm_manager\(firm_id\)/);
    assert.match(migration, /requires_manager/);
  });

  it('keeps membership helpers in private schema', () => {
    assert.match(migration, /create schema if not exists private/);
    assert.match(migration, /create or replace function private\.is_firm_member/);
    assert.match(migration, /set search_path = ''/);
  });

  it('defines a service-role-only seed that plants manager and analyst members', () => {
    assert.match(migration, /create or replace function public\.run_dev_seed/);
    assert.match(migration, new RegExp(SMOKE_FIRM_NAME));
    assert.match(migration, /'manager'::public\.firm_role/);
    assert.match(migration, /'analyst'::public\.firm_role/);
    assert.match(migration, /grant execute on function public\.run_dev_seed\(\) to service_role/);
    assert.match(migration, /revoke all on function public\.run_dev_seed\(\) from public, anon, authenticated/);
  });
});
