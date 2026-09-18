/**
 * CA-9 Meeting Ghostwriter: draft 1-pager with receipts; send/export is manager-gated.
 */
import { randomUUID } from 'node:crypto';
import { composeMeetingOnePager } from '../meetings/compose.js';
import {
  MEETING_CHANNELS,
  MEETING_PURPOSE,
  makeReceipt,
  receiptsPanel,
} from '../meetings/receipts.js';
import { insertProposal } from './proposal-tools.js';
import { excerpt, unwrap } from './query.js';
import { badArgs, conflict, notFound } from './tool-error.js';

function publicMeeting(row) {
  const panel = receiptsPanel(row);
  return {
    id: row.id,
    firm_id: row.firm_id,
    client_id: row.client_id ?? null,
    title: row.title,
    body: row.body ?? '',
    sections: Array.isArray(row.sections) ? row.sections : [],
    receipts: Array.isArray(row.receipts) ? row.receipts : [],
    purpose: row.purpose ?? MEETING_PURPOSE,
    status: row.status,
    created_by: row.created_by ?? null,
    published_at: row.published_at ?? null,
    sent_at: row.sent_at ?? null,
    send_channel: row.send_channel ?? null,
    public_url: null,
    client_facing: panel.client_facing,
    receipts_panel: panel,
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
  unwrap({ data, error }, 'Failed to load meeting 1-pager');
  if (!data) {
    throw notFound('Meeting 1-pager not found');
  }
  return data;
}

async function loadClient(client, session, clientId) {
  const { data, error } = await client
    .from('clients')
    .select('id, display_name, status')
    .eq('id', clientId)
    .eq('firm_id', session.firmId)
    .maybeSingle();
  unwrap({ data, error }, 'Failed to load client');
  if (!data) {
    throw notFound('Client not found');
  }
  return data;
}

function nextCitation(n) {
  return `R${n}`;
}

async function collectReceipts(client, session, args, clientRow) {
  const receipts = [];
  let n = 1;
  const firmId = session.firmId;

  function push(row) {
    receipts.push(
      makeReceipt({
        id: randomUUID(),
        citation: nextCitation(n),
        firm_id: firmId,
        ...row,
      })
    );
    n += 1;
  }

  if (args.include_notes !== false) {
    let q = client
      .from('notes')
      .select('id, body, created_at, client_id')
      .eq('firm_id', firmId)
      .eq('client_id', clientRow.id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (Array.isArray(args.note_ids) && args.note_ids.length > 0) {
      q = client
        .from('notes')
        .select('id, body, created_at, client_id')
        .eq('firm_id', firmId)
        .eq('client_id', clientRow.id)
        .in('id', args.note_ids);
    }
    const notes = unwrap(await q, 'Failed to list notes') ?? [];
    for (const note of notes) {
      push({
        source_table: 'notes',
        source_id: note.id,
        label: 'Client note',
        excerpt: excerpt(note.body, 160),
        as_of: note.created_at ?? null,
      });
    }
  }

  let portfolioId = args.portfolio_id;
  if (!portfolioId) {
    const portfolios =
      unwrap(
        await client
          .from('portfolios')
          .select('id, name, cash_balance, cash_currency')
          .eq('firm_id', firmId)
          .eq('client_id', clientRow.id)
          .order('name', { ascending: true })
          .limit(1),
        'Failed to list portfolios'
      ) ?? [];
    portfolioId = portfolios[0]?.id ?? null;
    if (portfolios[0] && args.include_holdings !== false) {
      push({
        source_table: 'portfolios',
        source_id: portfolios[0].id,
        label: portfolios[0].name ?? 'Portfolio',
        excerpt: `Cash ${portfolios[0].cash_balance ?? 0} ${portfolios[0].cash_currency ?? 'USD'}`,
        as_of: new Date().toISOString(),
      });
    }
  } else if (args.include_holdings !== false) {
    const { data, error } = await client
      .from('portfolios')
      .select('id, name, cash_balance, cash_currency, client_id')
      .eq('id', portfolioId)
      .eq('firm_id', firmId)
      .maybeSingle();
    unwrap({ data, error }, 'Failed to load portfolio');
    if (!data) {
      throw notFound('Portfolio not found');
    }
    push({
      source_table: 'portfolios',
      source_id: data.id,
      label: data.name ?? 'Portfolio',
      excerpt: `Cash ${data.cash_balance ?? 0} ${data.cash_currency ?? 'USD'}`,
      as_of: new Date().toISOString(),
    });
  }

  if (args.include_holdings !== false && portfolioId) {
    const holdings =
      unwrap(
        await client
          .from('holdings')
          .select('id, instrument_id, quantity, as_of')
          .eq('firm_id', firmId)
          .eq('portfolio_id', portfolioId)
          .order('id', { ascending: true })
          .limit(20),
        'Failed to list holdings'
      ) ?? [];
    const instrumentIds = [...new Set(holdings.map((row) => row.instrument_id).filter(Boolean))];
    let instruments = [];
    if (instrumentIds.length > 0) {
      instruments =
        unwrap(
          await client.from('instruments').select('id, symbol').eq('firm_id', firmId).in('id', instrumentIds),
          'Failed to list instruments'
        ) ?? [];
    }
    const byId = new Map(instruments.map((row) => [row.id, row]));
    const lines = holdings.map((row) => {
      const symbol = byId.get(row.instrument_id)?.symbol ?? row.instrument_id;
      return `${symbol} qty ${row.quantity}`;
    });
    if (holdings.length > 0) {
      push({
        source_table: 'holdings',
        source_id: holdings[0].id,
        label: 'Holdings snapshot',
        excerpt: lines.join('; '),
        as_of: holdings[0].as_of ?? new Date().toISOString(),
      });
    }
  }

  if (args.include_proposals !== false) {
    let q = client
      .from('proposals')
      .select('id, kind, status, preview, created_at')
      .eq('firm_id', firmId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (Array.isArray(args.proposal_ids) && args.proposal_ids.length > 0) {
      q = client
        .from('proposals')
        .select('id, kind, status, preview, created_at')
        .eq('firm_id', firmId)
        .in('id', args.proposal_ids);
    }
    const proposals = unwrap(await q, 'Failed to list proposals') ?? [];
    for (const proposal of proposals) {
      push({
        source_table: 'proposals',
        source_id: proposal.id,
        label: proposal.preview?.title ?? proposal.kind,
        excerpt: `${proposal.kind} (${proposal.status})`,
        as_of: proposal.created_at ?? null,
      });
    }
  }

  if (args.include_reports !== false) {
    let q = client
      .from('reports')
      .select('id, title, status, updated_at')
      .eq('firm_id', firmId)
      .eq('client_id', clientRow.id)
      .order('updated_at', { ascending: false })
      .limit(3);
    if (Array.isArray(args.report_ids) && args.report_ids.length > 0) {
      q = client
        .from('reports')
        .select('id, title, status, updated_at')
        .eq('firm_id', firmId)
        .in('id', args.report_ids);
    }
    const reports = unwrap(await q, 'Failed to list reports') ?? [];
    for (const report of reports) {
      if (args.report_id && report.id === args.report_id) {
        continue;
      }
      push({
        source_table: 'reports',
        source_id: report.id,
        label: report.title,
        excerpt: `status ${report.status}`,
        as_of: report.updated_at ?? null,
      });
    }
  }

  return receipts;
}

export const GHOSTWRITER_TOOLS = {
  ghostwrite_meeting_one_pager: {
    description:
      'Draft a meeting/client 1-pager that cites firm-scoped receipts. Does not send or export.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['client_id'],
      properties: {
        client_id: { type: 'string' },
        portfolio_id: { type: 'string' },
        report_id: { type: 'string' },
        title: { type: 'string' },
        meeting_date: { type: 'string' },
        include_notes: { type: 'boolean' },
        include_holdings: { type: 'boolean' },
        include_proposals: { type: 'boolean' },
        include_reports: { type: 'boolean' },
        note_ids: { type: 'array', items: { type: 'string' } },
        proposal_ids: { type: 'array', items: { type: 'string' } },
        report_ids: { type: 'array', items: { type: 'string' } },
      },
    },
    audit: ({ data }) => ({
      action: 'meeting.ghostwritten',
      entityTable: 'reports',
      entityId: data?.id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const clientRow = await loadClient(client, session, args.client_id);
      const receipts = await collectReceipts(client, session, args, clientRow);
      if (receipts.length === 0) {
        throw badArgs('No firm-scoped receipts found to cite');
      }
      const title =
        String(args.title ?? '').trim() ||
        `Meeting 1-pager — ${clientRow.display_name}`;
      const composed = composeMeetingOnePager({
        client: clientRow,
        title,
        meeting_date: args.meeting_date ?? null,
        receipts,
      });
      const sections = composed.sections.map((section) => ({
        ...section,
        id: randomUUID(),
      }));

      if (args.report_id) {
        const existing = await loadReport(client, session, args.report_id);
        if (existing.status !== 'draft') {
          throw conflict('Only draft 1-pagers can be ghostwritten', 'conflict');
        }
        const { data, error } = await client
          .from('reports')
          .update({
            title: composed.title,
            body: composed.body,
            sections,
            receipts,
            purpose: MEETING_PURPOSE,
            client_id: clientRow.id,
          })
          .eq('id', existing.id)
          .eq('firm_id', session.firmId)
          .eq('status', 'draft')
          .select('*')
          .maybeSingle();
        unwrap({ data, error }, 'Failed to update meeting 1-pager');
        if (!data) {
          throw conflict('Draft 1-pager update was not applied', 'conflict');
        }
        return publicMeeting(data);
      }

      const { data, error } = await client
        .from('reports')
        .insert({
          firm_id: session.firmId,
          client_id: clientRow.id,
          title: composed.title,
          body: composed.body,
          sections,
          receipts,
          purpose: MEETING_PURPOSE,
          status: 'draft',
          created_by: session.userId,
          published_at: null,
          sent_at: null,
          send_channel: null,
        })
        .select('*')
        .single();
      unwrap({ data, error }, 'Failed to create meeting 1-pager draft');
      return publicMeeting(data);
    },
  },
  get_meeting_one_pager: {
    description: 'Get a meeting 1-pager draft including the receipts workspace panel.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['report_id'],
      properties: { report_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'meeting.read',
      entityTable: 'reports',
      entityId: args.report_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const row = await loadReport(client, session, args.report_id);
      return publicMeeting(row);
    },
  },
  get_meeting_receipts: {
    description: 'Workspace receipts panel for a meeting 1-pager (firm-scoped, auditable).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['report_id'],
      properties: { report_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'meeting.receipts',
      entityTable: 'reports',
      entityId: args.report_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const row = await loadReport(client, session, args.report_id);
      return receiptsPanel(row);
    },
  },
  propose_meeting_send: {
    description:
      'Open a pending meeting send/export proposal (manager confirm). No email or public URL until confirm.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['report_id'],
      properties: {
        report_id: { type: 'string' },
        channel: { type: 'string', enum: ['email', 'export'] },
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
      if (report.purpose !== MEETING_PURPOSE) {
        throw badArgs('Report is not a meeting 1-pager');
      }
      if (report.status !== 'draft') {
        throw conflict('Only draft 1-pagers can be proposed for send/export', 'conflict');
      }
      const receipts = Array.isArray(report.receipts) ? report.receipts : [];
      if (receipts.length === 0) {
        throw badArgs('Meeting 1-pager has no receipts to send');
      }
      const channel = args.channel ?? 'export';
      if (!MEETING_CHANNELS.includes(channel)) {
        throw badArgs('channel must be email or export');
      }
      return insertProposal(client, session, {
        kind: 'meeting_send',
        payload: {
          report_id: report.id,
          title: report.title,
          client_id: report.client_id ?? null,
          channel,
          receipts,
          public_url: null,
        },
        idempotency_key: args.idempotency_key,
        expires_at: args.expires_at,
      });
    },
  },
  export_meeting_one_pager: {
    description:
      'Audited export of a manager-confirmed meeting 1-pager. Never returns an anonymous public URL.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['report_id'],
      properties: { report_id: { type: 'string' } },
    },
    audit: ({ args }) => ({
      action: 'meeting.exported',
      entityTable: 'reports',
      entityId: args.report_id,
      sensitive: true,
    }),
    async handler({ session, client, args }) {
      const report = await loadReport(client, session, args.report_id);
      if (report.purpose !== MEETING_PURPOSE) {
        throw badArgs('Report is not a meeting 1-pager');
      }
      if (report.status !== 'published' || !report.sent_at) {
        throw conflict('Meeting 1-pager has not been confirmed for email/export', 'not_sent');
      }
      const pub = publicMeeting(report);
      return {
        ...pub,
        public_url: null,
        export: {
          format: 'json',
          audited: true,
          channel: report.send_channel ?? 'export',
          excerpt: excerpt(report.body, 160),
        },
      };
    },
  },
};
