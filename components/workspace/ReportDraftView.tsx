import { Badge } from '@/components/primitives/Badge';
import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';

export type ReportDraft = {
  id: string;
  title?: string;
  body?: string;
  sections?: Array<{ heading?: string; body?: string; ordinal?: number }>;
  status?: string;
  public_url?: null;
};

export function ReportDraftView({ report }: { report: ReportDraft | null }) {
  if (!report) {
    return <DashedEmptySlot label="No report draft selected" />;
  }
  const sections = Array.isArray(report.sections) ? report.sections : [];
  return (
    <article style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{report.title ?? 'Untitled draft'}</h2>
        <Badge>{report.status ?? 'draft'}</Badge>
        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>public_url: null</span>
      </header>
      {sections.length > 0
        ? sections.map((section, index) => (
            <section key={`${section.heading ?? 'section'}-${index}`}>
              {section.heading ? <h3 style={{ margin: '0 0 4px', fontSize: 13 }}>{section.heading}</h3> : null}
              <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{section.body}</p>
            </section>
          ))
        : (
          <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{report.body || 'Empty draft body.'}</p>
        )}
    </article>
  );
}
