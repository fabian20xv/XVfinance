import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { boot } from '../src/config/startup.js';
import {
  PARENT_SUPABASE_PROJECT_REF,
  assertAllowedSupabaseUrl,
  assertTessDevelopSupabaseUrl,
} from '../src/config/supabase-lock.js';
import {
  TESS_ALPHA_FIRM_ID,
  TESS_ALPHA_FIRM_NAME,
  TESS_BETA_FIRM_ID,
  TESS_QA_DEFAULT_PASSWORD,
  TESS_SCHEMA_TABLES,
  TESS_TOP_10_JOBS,
  TESS_USERS,
} from '../src/db/tess-ids.js';
import {
  assertTessDevelopTarget,
  buildTessFixtureInventory,
  runTessDevelopSeed,
} from '../src/server/tess-seed.js';
import { createMemoryClient } from './helpers/memory-client.js';

const PARENT_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const DEVELOP_URL = 'https://bkwhqfkosxnoffpsjcug.supabase.co';
const DEVELOP_REF = 'bkwhqfkosxnoffpsjcug';
const THIRD_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function runScript(script, env, extraArgs = []) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function createTessAdmin() {
  const client = createMemoryClient();
  const users = [];
  client.auth = {
    admin: {
      async getUserById(id) {
        const user = users.find((row) => row.id === id);
        if (!user) {
          return { data: { user: null }, error: { message: 'User not found', status: 404 } };
        }
        return { data: { user }, error: null };
      },
      async createUser(attrs) {
        const user = {
          id: attrs.id,
          email: attrs.email,
          app_metadata: attrs.app_metadata,
          user_metadata: attrs.user_metadata,
        };
        users.push(user);
        return { data: { user }, error: null };
      },
      async updateUserById(id, attrs) {
        const user = users.find((row) => row.id === id);
        if (!user) {
          return { data: { user: null }, error: { message: 'User not found', status: 404 } };
        }
        Object.assign(user, {
          email: attrs.email ?? user.email,
          app_metadata: attrs.app_metadata ?? user.app_metadata,
          user_metadata: attrs.user_metadata ?? user.user_metadata,
        });
        return { data: { user }, error: null };
      },
    },
  };
  client._users = users;
  return client;
}

describe('Tess develop seed lock (additive; parent E0 boot unchanged)', () => {
  it('boot() still accepts the parent project for app runtime', () => {
    const locked = boot({ SUPABASE_URL: PARENT_URL });
    assert.equal(locked.ref, PARENT_SUPABASE_PROJECT_REF);
    assert.equal(assertAllowedSupabaseUrl(PARENT_URL).ref, PARENT_SUPABASE_PROJECT_REF);
  });

  it('assertTessDevelopSupabaseUrl accepts only the develop ref', () => {
    const locked = assertTessDevelopSupabaseUrl(DEVELOP_URL);
    assert.equal(locked.ref, DEVELOP_REF);
    assert.equal(locked.role, 'develop');
  });

  it('fails loud when pointed at the parent/prod project', () => {
    assert.throws(
      () => assertTessDevelopSupabaseUrl(PARENT_URL),
      /Refused parent\/prod Supabase ref "krcwpupbdizzjyydzaqp"/
    );
    assert.throws(
      () => assertTessDevelopTarget({ SUPABASE_URL: PARENT_URL }),
      /Never seed Tess\/QA data into the parent project/
    );
  });

  it('fails loud for a third Supabase project ref', () => {
    assert.throws(
      () => assertTessDevelopSupabaseUrl(THIRD_URL),
      /Refused Supabase project ref/
    );
  });

  it('fails loud when SUPABASE_URL is missing', () => {
    assert.throws(
      () => assertTessDevelopTarget({}),
      /SUPABASE_URL is required for Tess develop seed/
    );
  });

  it('fails loud when APP_ENV is production even on develop', () => {
    assert.throws(
      () => assertTessDevelopTarget({ SUPABASE_URL: DEVELOP_URL, APP_ENV: 'production' }),
      /production/
    );
  });
});

describe('Tess fixture inventory shape', () => {
  it('describes two Tess-labeled tenants with privileged and restricted writers', () => {
    const inventory = buildTessFixtureInventory();
    assert.equal(inventory.project_ref, DEVELOP_REF);
    assert.equal(inventory.forbidden_parent_ref, PARENT_SUPABASE_PROJECT_REF);
    assert.equal(inventory.tenants.length, 2);
    assert.equal(inventory.tenants[0].id, TESS_ALPHA_FIRM_ID);
    assert.equal(inventory.tenants[1].id, TESS_BETA_FIRM_ID);
    assert.match(inventory.tenants[0].name, /Tess/);
    assert.match(inventory.tenants[1].name, /Tess/);
    assert.equal(inventory.tenants[0].privileged_writer, 'manager');
    assert.equal(inventory.tenants[0].restricted_writer, 'analyst');

    assert.equal(inventory.users.length, 4);
    assert.ok(inventory.users.every((user) => user.platform_admin === false));
    assert.ok(inventory.users.every((user) => user.firm_member === true));
    assert.ok(inventory.users.some((user) => user.role === 'manager' && user.writer === 'privileged'));
    assert.ok(inventory.users.some((user) => user.role === 'analyst' && user.writer === 'restricted'));
    assert.ok(inventory.users.every((user) => TESS_USERS.some((seed) => seed.email === user.email)));
  });

  it('covers top-10 IM jobs with domain rows Tess needs', () => {
    const inventory = buildTessFixtureInventory();
    assert.equal(inventory.top_10_jobs.length, 10);
    assert.deepEqual(
      inventory.top_10_jobs.map((job) => job.id),
      TESS_TOP_10_JOBS.map((job) => job.id)
    );
    assert.equal(inventory.domain.clients.length, 3);
    assert.equal(inventory.domain.portfolios_with_cash_liquidity.length, 3);
    assert.ok(inventory.domain.holdings.length >= 2);
    assert.ok(inventory.domain.notes.length >= 2);
    assert.ok(inventory.domain.watchlists.length >= 1);
    assert.ok(inventory.domain.pending_proposal_id);
    assert.ok(inventory.domain.draft_report_id);
    assert.ok(inventory.domain.audit_events.length >= 2);
    for (const table of TESS_SCHEMA_TABLES) {
      assert.ok(typeof table === 'string' && table.length > 0);
    }
    assert.equal(TESS_ALPHA_FIRM_NAME.includes('Tess'), true);
  });
});

describe('scripts/seed-tess-develop.js process guard', () => {
  it('refuses the parent ref with a clear error', () => {
    const result = runScript('scripts/seed-tess-develop.js', {
      SUPABASE_URL: PARENT_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key-not-used',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Tess develop seed aborted/);
    assert.match(result.stderr, /krcwpupbdizzjyydzaqp/);
    assert.match(result.stderr, /Never seed Tess\/QA data into the parent project/);
  });

  it('refuses a third Supabase project', () => {
    const result = runScript('scripts/seed-tess-develop.js', {
      SUPABASE_URL: THIRD_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key-not-used',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refused Supabase project ref/);
  });

  it('dry-run succeeds against develop without a service-role key', () => {
    const result = runScript(
      'scripts/seed-tess-develop.js',
      { SUPABASE_URL: DEVELOP_URL, SUPABASE_SERVICE_ROLE_KEY: '' },
      ['--dry-run']
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dry-run OK/);
    assert.match(result.stdout, /bkwhqfkosxnoffpsjcug/);
    assert.match(result.stdout, /2 tenants/);
    assert.doesNotMatch(result.stdout, new RegExp(TESS_QA_DEFAULT_PASSWORD));
  });

  it('npm run seed still refuses a third project (parent product seed unchanged)', () => {
    const result = runScript('scripts/seed-dev.js', {
      SUPABASE_URL: THIRD_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key-not-used',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refused Supabase project ref/);
  });
});

describe('Tess develop seed writes (injected service-role client)', () => {
  it('upserts firms, members, cash portfolios, pending proposal, draft report, and audit events', async () => {
    const admin = createTessAdmin();
    const result = await runTessDevelopSeed(
      {
        SUPABASE_URL: DEVELOP_URL,
        SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
      },
      { createAdmin: () => admin, argv: ['node', 'seed'] }
    );

    assert.equal(result.ok, true);
    assert.equal(result.dry_run, false);
    assert.equal(result.project_ref, DEVELOP_REF);
    assert.equal(admin.db.firms.length, 2);
    assert.equal(admin.db.firm_members.length, 4);
    assert.ok(admin.db.firm_members.some((row) => row.role === 'manager'));
    assert.ok(admin.db.firm_members.some((row) => row.role === 'analyst'));
    assert.equal(admin._users.length, 4);
    assert.ok(admin._users.every((user) => user.app_metadata.xvfinance_platform_admin === false));

    const portfolio = admin.db.portfolios.find((row) => row.id === result.inventory.domain.portfolios[0]);
    assert.ok(portfolio.cash_balance > 0);
    assert.ok(portfolio.liquidity_available > 0);
    assert.ok(portfolio.liquidity_buffer >= 0);

    assert.equal(admin.db.proposals[0].status, 'pending_confirm');
    assert.equal(admin.db.reports[0].status, 'draft');
    assert.ok(admin.db.audit_events.length >= 2);
    assert.ok(admin.db.audit_events.every((row) => row.firm_id === TESS_ALPHA_FIRM_ID || row.firm_id === TESS_BETA_FIRM_ID));
    assert.ok(admin.db.notes.length >= 2);
    assert.ok(admin.db.watchlists.length >= 1);
    assert.ok(admin.db.holdings.length >= 2);
  });

  it('explains when develop schema is behind', async () => {
    const admin = {
      from() {
        return {
          select() {
            return {
              limit: async () => ({
                data: null,
                error: { message: 'Could not find the table public.firms in the schema cache' },
              }),
            };
          },
        };
      },
      auth: { admin: {} },
    };

    await assert.rejects(
      () =>
        runTessDevelopSeed(
          { SUPABASE_URL: DEVELOP_URL, SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key' },
          { createAdmin: () => admin, argv: ['node', 'seed'] }
        ),
      /Develop schema is behind main/
    );
  });
});

describe('Tess develop seed docs', () => {
  it('documents develop-only usage and the parent forbid', () => {
    const docs = readFileSync(join(root, 'docs/tess-develop-seed.md'), 'utf8');
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    for (const text of [docs, readme]) {
      assert.match(text, /seed:tess/);
      assert.match(text, /bkwhqfkosxnoffpsjcug/);
      assert.match(text, /krcwpupbdizzjyydzaqp/);
      assert.match(text, /never seed|must not seed|forbidden|do not seed tess/i);
    }
    assert.match(docs, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(docs, /SUPABASE_ANON_KEY/);
    assert.match(docs, /schema migrations must be applied to develop/i);
    assert.doesNotMatch(docs, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });
});
