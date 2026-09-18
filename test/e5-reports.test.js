import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dispatchTool, listToolNames } from '../src/chat/tool-router.js';
import { requiresRoleForKind } from '../src/proposals/defaults.js';
import {
  SMOKE_ANALYST_ID,
  SMOKE_CLIENT_ID,
  SMOKE_FIRM_ID,
  SMOKE_MANAGER_ID,
  SMOKE_NOTE_ID,
  SMOKE_REPORT_ID,
} from '../src/db/smoke-ids.js';
import { createMemoryClient } from './helpers/memory-client.js';

const env = {
  SUPABASE_URL: 'https://krcwpupbdizzjyydzaqp.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak',
};

const manager = {
  userId: SMOKE_MANAGER_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'manager',
};

const analyst = {
  userId: SMOKE_ANALYST_ID,
  firmId: SMOKE_FIRM_ID,
  role: 'analyst',
};

function client() {
  return createMemoryClient({
    notes: [
      {
        id: SMOKE_NOTE_ID,
        firm_id: SMOKE_FIRM_ID,
        client_id: SMOKE_CLIENT_ID,
        body: 'Smoke note: IPS review scheduled.',
        created_by: SMOKE_ANALYST_ID,
      },
    ],
    reports: [
      {
        id: SMOKE_REPORT_ID,
        firm_id: SMOKE_FIRM_ID,
        client_id: SMOKE_CLIENT_ID,
        title: 'Smoke quarterly draft',
        body: 'Draft body',
        sections: [],
        status: 'draft',
        created_by: SMOKE_ANALYST_ID,
        published_at: null,
      },
    ],
    proposals: [],
  });
}

async function run(name, args, { session = analyst, db = client() } = {}) {
  return {
    result: await dispatchTool({
      name,
      args,
      session,
      userJwt: 'user-jwt',
      env,
      createUserClient: () => db,
    }),
    db,
  };
}

describe('CA-5 notes + draft reports', () => {
  it('registers note create/update, draft report, publish, and export tools', () => {
    const names = listToolNames();
    for (const name of [
      'propose_note_create',
      'propose_note_update',
      'create_report_draft',
      'update_report_section',
      'propose_report_publish',
      'export_published_report',
      'list_reports',
      'get_report',
    ]) {
      assert.ok(names.includes(name), name);
    }
  });

  it('defaults note proposals to any_member', () => {
    assert.equal(requiresRoleForKind('note_upsert'), 'any_member');
    assert.equal(requiresRoleForKind('report_publish'), 'manager');
  });

  it('opens note create and update proposals as any_member', async () => {
    const created = await run('propose_note_create', {
      client_id: SMOKE_CLIENT_ID,
      body: 'New IPS follow-up.',
    });
    assert.equal(created.result.ok, true);
    assert.equal(created.result.data.kind, 'note_upsert');
    assert.equal(created.result.data.requires_role, 'any_member');
    assert.equal(created.result.data.payload.id, undefined);

    const updated = await run('propose_note_update', {
      id: SMOKE_NOTE_ID,
      body: 'Updated body',
    });
    assert.equal(updated.result.ok, true);
    assert.equal(updated.result.data.payload.id, SMOKE_NOTE_ID);
    assert.equal(updated.result.data.payload.client_id, SMOKE_CLIENT_ID);
    assert.equal(updated.result.data.requires_role, 'any_member');
  });

  it('creates a draft and updates a section without a proposal', async () => {
    const { result: created, db } = await run('create_report_draft', {
      title: 'Q3 letter',
      client_id: SMOKE_CLIENT_ID,
    });
    assert.equal(created.ok, true);
    assert.equal(created.data.status, 'draft');
    assert.equal(created.data.public_url, null);
    assert.deepEqual(created.data.sections, []);

    const { result: section } = await run(
      'update_report_section',
      {
        report_id: created.data.id,
        heading: 'Outlook',
        body: 'Stay invested.',
        ordinal: 0,
      },
      { db }
    );
    assert.equal(section.ok, true);
    assert.equal(section.data.sections.length, 1);
    assert.equal(section.data.sections[0].heading, 'Outlook');
    assert.equal(section.data.status, 'draft');
  });

  it('proposes manager-gated publish and exports only published reports', async () => {
    const db = client();
    const { result: proposed } = await run(
      'propose_report_publish',
      { report_id: SMOKE_REPORT_ID },
      { db }
    );
    assert.equal(proposed.ok, true);
    assert.equal(proposed.data.kind, 'report_publish');
    assert.equal(proposed.data.requires_role, 'manager');
    assert.equal(proposed.data.payload.public_url, null);

    const unpublished = await run('export_published_report', { report_id: SMOKE_REPORT_ID }, { db });
    assert.equal(unpublished.result.ok, false);
    assert.equal(unpublished.result.error.code, 'not_published');

    db.db.reports[0].status = 'published';
    db.db.reports[0].published_at = '2026-09-18T00:00:00.000Z';
    const { result: exported } = await run(
      'export_published_report',
      { report_id: SMOKE_REPORT_ID },
      { session: manager, db }
    );
    assert.equal(exported.ok, true);
    assert.equal(exported.data.public_url, null);
    assert.equal(exported.data.export.audited, true);
    assert.equal(exported.audit.action, 'report.exported');
  });
});
