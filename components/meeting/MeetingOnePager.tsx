import { Badge } from '@/components/primitives/Badge';
import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';
import { ReceiptFootnote } from '@/components/meeting/ReceiptFootnote';

export type MeetingReport = {
  id: string;
  title?: string;
  body?: string;
  sections?: Array<{ heading?: string; body?: string }>;
  status?: string;
  public_url?: null;
  receipts?: Array<{
    citation?: string;
    label?: string;
    excerpt?: string;
    as_of?: string | null;
    public_url?: null;
  }>;
};

export function MeetingOnePager({ report }: { report: MeetingReport | null }) {
  if (!report) {
    return <DashedEmptySlot label="No meeting 1-pager loaded" />;
  }
  const sections = Array.isArray(report.sections) ? report.sections : [];
  return (
    <article data-public-url="null" style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{report.title ?? 'Meeting 1-pager'}</h2>
        <Badge>{report.status ?? 'draft'}</Badge>
      </header>
      {sections.length > 0
        ? sections.map((section, index) => (
            <section key={`${section.heading}-${index}`}>
              <h3 style={{ margin: '0 0 4px', fontSize: 13 }}>{section.heading}</h3>
              <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{section.body}</p>
            </section>
          ))
        : (
          <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{report.body}</p>
        )}
      <ReceiptFootnote receipts={report.receipts ?? []} />
    </article>
  );
}
