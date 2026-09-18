/**
 * Compose a meeting/client 1-pager body from firm-scoped receipts.
 */
import { excerpt } from '../chat/query.js';

/**
 * @param {object} options
 * @param {{ display_name?: string }} options.client
 * @param {string} options.title
 * @param {string | null} options.meeting_date
 * @param {Array<{ citation: string, label: string, excerpt?: string }>} options.receipts
 */
export function composeMeetingOnePager({ client, title, meeting_date, receipts }) {
  const name = client?.display_name ?? 'Client';
  const when = meeting_date ? ` (${meeting_date})` : '';
  const cites = receipts.map((row) => `[${row.citation}]`).join(' ');
  const snapshot = receipts.filter((row) => row.source_table === 'holdings' || row.source_table === 'portfolios');
  const notes = receipts.filter((row) => row.source_table === 'notes');
  const proposals = receipts.filter((row) => row.source_table === 'proposals');
  const reports = receipts.filter((row) => row.source_table === 'reports');

  const sections = [
    {
      heading: 'Purpose',
      body: `${title}${when} for ${name}. This draft is internal until a manager confirms email/export. Citations: ${cites || '(none)'}.`,
    },
    {
      heading: 'Portfolio snapshot',
      body:
        snapshot.length > 0
          ? snapshot.map((row) => `[${row.citation}] ${row.label}: ${row.excerpt || ''}`).join('\n')
          : 'No holdings snapshot attached.',
    },
    {
      heading: 'Notes & open items',
      body:
        notes.length > 0
          ? notes.map((row) => `[${row.citation}] ${excerpt(row.excerpt, 200)}`).join('\n')
          : 'No notes cited.',
    },
    {
      heading: 'Proposals & prior reports',
      body: [
        ...proposals.map((row) => `[${row.citation}] Proposal — ${row.label}`),
        ...reports.map((row) => `[${row.citation}] Report — ${row.label}`),
      ].join('\n') || 'No proposals or reports cited.',
    },
  ];

  const appendix = receipts
    .map((row) => `[${row.citation}] ${row.source_table} ${row.source_id} — ${row.label}`)
    .join('\n');
  sections.push({
    heading: 'Receipts',
    body: appendix || 'No receipts.',
  });

  const body = sections
    .map((section, ordinal) => `## ${ordinal + 1}. ${section.heading}\n${section.body}`)
    .join('\n\n');

  return {
    title,
    body,
    sections: sections.map((section, ordinal) => ({
      heading: section.heading,
      body: section.body,
      ordinal,
    })),
  };
}
