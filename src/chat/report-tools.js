/**
 * CA-5 notes (create/update proposals) + draft reports + publish/export.
 * Draft writes are direct (RLS). Publish is a manager proposal. No public URL.
 */
import { insertProposal } from './proposal-tools.js';
import { applyRange, excerpt, pageResult, pagination, unwrap } from './query.js';
import { badArgs, conflict, notFound } from './tool-error.js';
import { randomUUID } from 'node:crypto';

const PAGE_PROPERTIES = {
  limit: { type: 'integer', minimum: 1, maximum: 100 },
  offset: { type: 'integer', minimum: 0 },
};

function publicReport(row) {
  return {
    id: row.id,
    firm_id: row.firm_id,
    client_id: row.client_id ?? null,
    title: row.title,
    body: row.body ?? '',
    sections: Array.isArray(row.sections) ? row.sections : [],
    status: row.status,
    created_by: row.created_by ?? null,
    published_at: row.published_at ?? null,
    public_url: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadReport(client, session, reportId) {
  const { data, error } = await client
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .eq('firm_id', session.firmId)
    .maybeSingle();
  unwrap({ data, error }, 'Failed to load report');
  if (!data) {
    throw notFound('Report not found');
  }
  return data;
}

function flattenBody(sections) {
  return sections
    .slice()
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    .map((section) => {
      const heading = section.heading ? `${section.heading}\n` : '';
      return `${heading}${section.body ?? ''}`.trim();
    })
    .filter(Boolean)
    .join('\n\n');
}

export const REPORT_TOOLS = {
  propose_note_create: {
    description:
      'Open a pending note-create proposal. Confirm default any_member (analyst or manager).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['client_id', 'body'],
      properties: {
        client_id: { type: 'string' },
        body: { type: 'string' },
        idempotency_key: { type: 'string' },
        expires_at: { type: 'string' },
      },
    },
    audit: ({ data }) => ({
      action: 'proposal.submitted',
      entityTable: 'proposals',
      entityId: data?.id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      return insertProposal(client, session, {
        kind: 'note_upsert',
        payload: { client_id: args.client_id, body: args.body },
        idempotency_key: args.idempotency_key,
        expires_at: args.expires_at,
      });
    },
  },
  propose_note_update: {
    description:
      'Open a pending note-update proposal. Confirm default any_member (analyst or manager).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'body'],
      properties: {
        id: { type: 'string' },
        client_id: { type: 'string' },
        body: { type: 'string' },
        idempotency_key: { type: 'string' },
        expires_at: { type: 'string' },
      },
    },
    audit: ({ data }) => ({
      action: 'proposal.submitted',
      entityTable: 'proposals',
      entityId: data?.id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      let clientId = args.client_id;
      if (!clientId) {
        const { data, error } = await client
          .from('notes')
          .select('id, client_id')
          .eq('id', args.id)
          .eq('firm_id', session.firmId)
          .maybeSingle();
        unwrap({ data, error }, 'Failed to load note');
        if (!data) {
          throw notFound('Note not found');
        }
        clientId = data.client_id;
      }
      return insertProposal(client, session, {
        kind: 'note_upsert',
        payload: { id: args.id, client_id: clientId, body: args.body },
        idempotency_key: args.idempotency_key,
        expires_at: args.expires_at,
      });
    },
  },
  list_reports: {
    description: 'List firm reports (draft and published). No public URL.',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['draft', 'published'] },
        client_id: { type: 'string' },
        ...PAGE_PROPERTIES,
      },
    },
    audit: {
      action: 'reports.list',
      entityTable: 'reports',
      sensitive: false,
    },
    async handler({ session, client, args }) {
      const { limit, offset } = pagination(args);
      let q = client
        .from('reports')
        .select('id, title, status, client_id, published_at, updated_at')
        .eq('firm_id', session.firmId)
        .order('updated_at', { ascending: false });
      if (args.status) {
        q = q.eq('status', args.status);
      }
      if (args.client_id) {
        q = q.eq('client_id', args.client_id);
      }
      const rows = unwrap(await applyRange(q, limit, offset), 'Failed to list reports') ?? [];
      const page = pageResult(rows, limit, offset);
      return {
        ...page,
        items: page.items.map((row) => ({
          id: row.id,
          label: row.title,
          status: row.status,
          client_id: row.client_id ?? null,
          published_at: row.published_at ?? null,
          public_url: null,
        })),
      };
    },
  },
  get_report: {
    description: 'Get one report including sections. public_url is always null.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['report_id'],
      properties: { report_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'report.read',
      entityTable: 'reports',
      entityId: args.report_id,
      sensitive: false,
    }),
    async handler({ session, client, args }) {
      const row = await loadReport(client, session, args.report_id);
      return publicReport(row);
    },
  },
  create_report_draft: {
    description: 'Create a draft report (no proposal). Members may insert drafts via RLS.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title'],
      properties: {
        title: { type: 'string' },
        client_id: { type: 'string' },
        body: { type: 'string' },
      },
    },
    audit: ({ data }) => ({
      action: 'report.draft_created',
      entityTable: 'reports',
      entityId: data?.id,
      sensitive: false,
    }),
    async handler({ session, client, args }) {
      const title = String(args.title ?? '').trim();
      if (!title) {
        throw badArgs('title is required');
      }
      const row = {
        firm_id: session.firmId,
        client_id: args.client_id ?? null,
        title,
        body: args.body ?? '',
        sections: [],
        status: 'draft',
        created_by: session.userId,
        published_at: null,
      };
      const { data, error } = await client.from('reports').insert(row).select('*').single();
      unwrap({ data, error }, 'Failed to create report draft');
      return publicReport(data);
    },
  },
  update_report_section: {
    description: 'Update or append a draft report section (no proposal).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['report_id'],
      properties: {
        report_id: { type: 'string' },
        section_id: { type: 'string' },
        heading: { type: 'string' },
        body: { type: 'string' },
        ordinal: { type: 'integer' },
      },
    },
    audit: ({ args }) => ({
      action: 'report.section_updated',
      entityTable: 'reports',
      entityId: args.report_id,
      sensitive: false,
    }),
    async handler({ session, client, args }) {
      const report = await loadReport(client, session, args.report_id);
      if (report.status !== 'draft') {
        throw conflict('Only draft reports can be edited', 'conflict');
      }
      const sections = Array.isArray(report.sections) ? [...report.sections] : [];
      const sectionId = args.section_id || randomUUID();
      const index = sections.findIndex((section) => section.id === sectionId);
      const next = {
        id: sectionId,
        heading: args.heading ?? (index >= 0 ? sections[index].heading : ''),
        body: args.body ?? (index >= 0 ? sections[index].body : ''),
        ordinal:
          args.ordinal ??
          (index >= 0 ? sections[index].ordinal : sections.length),
      };
      if (index >= 0) {
        sections[index] = { ...sections[index], ...next };
      } else {
        sections.push(next);
      }
      const { data, error } = await client
        .from('reports')
        .update({
          sections,
          body: flattenBody(sections) || report.body,
        })
        .eq('id', report.id)
        .eq('firm_id', session.firmId)
        .eq('status', 'draft')
        .select('*')
        .maybeSingle();
      unwrap({ data, error }, 'Failed to update report section');
      if (!data) {
        throw conflict('Draft section update was not applied', 'conflict');
      }
      return publicReport(data);
    },
  },
  propose_report_publish: {
    description: 'Open a pending report-publish proposal (manager confirm). No public URL.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['report_id'],
      properties: {
        report_id: { type: 'string' },
        idempotency_key: { type: 'string' },
        expires_at: { type: 'string' },
      },
    },
    audit: ({ data }) => ({
      action: 'proposal.submitted',
      entityTable: 'proposals',
      entityId: data?.id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const report = await loadReport(client, session, args.report_id);
      if (report.status !== 'draft') {
        throw conflict('Only draft reports can be proposed for publish', 'conflict');
      }
      return insertProposal(client, session, {
        kind: 'report_publish',
        payload: {
          report_id: report.id,
          title: report.title,
          client_id: report.client_id ?? null,
          public_url: null,
        },
        idempotency_key: args.idempotency_key,
        expires_at: args.expires_at,
      });
    },
  },
  export_published_report: {
    description:
      'Export a published report as an audited JSON snapshot. Never returns an anonymous public URL.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['report_id'],
      properties: { report_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'report.exported',
      entityTable: 'reports',
      entityId: args.report_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const report = await loadReport(client, session, args.report_id);
      if (report.status !== 'published') {
        throw conflict('Report is not published', 'not_published');
      }
      const pub = publicReport(report);
      return {
        ...pub,
        public_url: null,
        export: {
          format: 'json',
          audited: true,
          excerpt: excerpt(report.body, 160),
        },
      };
    },
  },
};
