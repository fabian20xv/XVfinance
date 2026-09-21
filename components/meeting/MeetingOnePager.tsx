'use client';

import { useState } from 'react';
import { Badge } from '@/components/primitives/Badge';
import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';
import { ReceiptFootnote, TextWithReceiptMarks } from '@/components/meeting/ReceiptFootnote';
import type { Receipt } from '@/components/meeting/ReceiptSideSlip';
import { withNullPublicUrl } from '@/src/web/dual-confirm.js';
import { RECEIPT_NO_LAST_MEETING } from '@/src/web/receipt-ui.js';

export type MeetingReport = {
  id: string;
  title?: string;
  body?: string;
  sections?: Array<{ heading?: string; body?: string }>;
  status?: string;
  public_url?: null;
  receipts?: Receipt[];
};

export function MeetingOnePager({
  report,
  missing = false,
}: {
  report: MeetingReport | null;
  missing?: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (!report) {
    return (
      <DashedEmptySlot
        label={missing ? RECEIPT_NO_LAST_MEETING : 'No meeting 1-pager loaded'}
        hint={missing ? undefined : RECEIPT_NO_LAST_MEETING}
        question
      />
    );
  }
  const sections = Array.isArray(report.sections) ? report.sections : [];
  const receipts = ((withNullPublicUrl({ receipts: report.receipts ?? [] }) as { receipts?: Receipt[] }).receipts ??
    []) as Receipt[];
  return (
    <article data-public-url="null" data-meeting-one-pager="true" style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{report.title ?? 'Meeting 1-pager'}</h2>
        <Badge>{report.status ?? 'draft'}</Badge>
      </header>
      {sections.length > 0
        ? sections.map((section, index) => (
            <section key={`${section.heading}-${index}`}>
              <h3
                style={{
                  margin: '0 0 10px',
                  fontSize: 11,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-muted)',
                  fontWeight: 500,
                }}
              >
                {section.heading}
              </h3>
              <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                <TextWithReceiptMarks
                  text={section.body ?? ''}
                  receipts={receipts}
                  openIndex={openIndex}
                  onOpen={setOpenIndex}
                  onClose={() => setOpenIndex(null)}
                />
              </p>
            </section>
          ))
        : (
          <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>
            <TextWithReceiptMarks
              text={report.body ?? ''}
              receipts={receipts}
              openIndex={openIndex}
              onOpen={setOpenIndex}
              onClose={() => setOpenIndex(null)}
            />
          </p>
        )}
      <ReceiptFootnote
        receipts={receipts}
        emptyReason={missing ? 'no-meeting' : 'unavailable'}
        openIndex={openIndex}
        onOpen={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </article>
  );
}
