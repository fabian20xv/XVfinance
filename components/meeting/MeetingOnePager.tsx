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
  enlarged = false,
  openIndex: openIndexProp,
  onOpenIndexChange,
}: {
  report: MeetingReport | null;
  missing?: boolean;
  enlarged?: boolean;
  openIndex?: number | null;
  onOpenIndexChange?: (index: number | null) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState<number | null>(null);
  const controlled = Boolean(onOpenIndexChange);
  const openIndex = controlled ? (openIndexProp ?? null) : uncontrolledOpen;
  const setOpenIndex = (index: number | null) => {
    if (onOpenIndexChange) {
      onOpenIndexChange(index);
      return;
    }
    setUncontrolledOpen(index);
  };
  const pagerClass = enlarged ? 'meeting-one-pager is-enlarged' : 'meeting-one-pager';
  if (!report) {
    return (
      <div className={pagerClass} data-meeting-one-pager="true" data-speak-ready={enlarged ? 'true' : 'false'}>
        <DashedEmptySlot
          label={missing ? RECEIPT_NO_LAST_MEETING : 'No meeting 1-pager loaded'}
          hint={missing ? undefined : RECEIPT_NO_LAST_MEETING}
          question
        />
      </div>
    );
  }
  const sections = Array.isArray(report.sections) ? report.sections : [];
  const receipts = ((withNullPublicUrl({ receipts: report.receipts ?? [] }) as { receipts?: Receipt[] }).receipts ??
    []) as Receipt[];
  const bodyStyle = enlarged
    ? { margin: 0, whiteSpace: 'pre-wrap' as const }
    : { margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' as const };
  return (
    <article
      data-public-url="null"
      data-meeting-one-pager="true"
      data-speak-ready={enlarged ? 'true' : 'false'}
      data-speak-body={enlarged ? '18/28' : undefined}
      className={pagerClass}
      style={{ display: 'grid', gap: enlarged ? 20 : 12 }}
    >
      <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h2 style={enlarged ? { margin: 0 } : { margin: 0, fontSize: 16 }}>{report.title ?? 'Meeting 1-pager'}</h2>
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
              <p className={enlarged ? 'meeting-body' : undefined} style={bodyStyle}>
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
          <p className={enlarged ? 'meeting-body' : undefined} style={bodyStyle}>
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
