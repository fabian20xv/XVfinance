'use client';

import { useMemo, useState } from 'react';
import { ReceiptMark, type Receipt } from '@/components/meeting/ReceiptSideSlip';
import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';
import { withNullPublicUrl } from '@/src/web/dual-confirm.js';
import {
  RECEIPT_CITE_RE,
  RECEIPT_NO_LAST_MEETING,
  RECEIPT_UNAVAILABLE,
  markIndexForToken,
} from '@/src/web/receipt-ui.js';

export function TextWithReceiptMarks({
  text,
  receipts,
  openIndex,
  onOpen,
  onClose,
}: {
  text: string;
  receipts: Receipt[];
  openIndex: number | null;
  onOpen: (index: number) => void;
  onClose: () => void;
}) {
  const parts = useMemo(() => {
    const out: Array<{ type: 'text' | 'mark'; value: string }> = [];
    const re = new RegExp(RECEIPT_CITE_RE.source, 'g');
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      if (match.index > last) {
        out.push({ type: 'text', value: text.slice(last, match.index) });
      }
      out.push({ type: 'mark', value: match[0] });
      last = match.index + match[0].length;
    }
    if (last < text.length) {
      out.push({ type: 'text', value: text.slice(last) });
    }
    return out.length ? out : [{ type: 'text' as const, value: text }];
  }, [text]);

  return (
    <>
      {parts.map((part, i) => {
        if (part.type !== 'mark') {
          return <span key={i}>{part.value}</span>;
        }
        const mapped = markIndexForToken(part.value, receipts);
        return (
          <ReceiptMark
            key={`${part.value}-${i}`}
            receipts={receipts}
            index={mapped.index}
            missing={mapped.missing}
            openIndex={openIndex}
            onOpen={onOpen}
            onClose={onClose}
          />
        );
      })}
    </>
  );
}

export function ReceiptFootnote({
  receipts,
  emptyReason = 'unavailable',
  openIndex: openIndexProp,
  onOpen: onOpenProp,
  onClose: onCloseProp,
}: {
  receipts: Receipt[];
  emptyReason?: 'unavailable' | 'no-meeting';
  openIndex?: number | null;
  onOpen?: (index: number) => void;
  onClose?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState<number | null>(null);
  const openIndex = openIndexProp ?? internalOpen;
  const onOpen = onOpenProp ?? setInternalOpen;
  const onClose = onCloseProp ?? (() => setInternalOpen(null));
  const safe = ((withNullPublicUrl({ receipts }) as { receipts?: Receipt[] }).receipts ?? []) as Receipt[];

  if (!safe.length) {
    const copy = emptyReason === 'no-meeting' ? RECEIPT_NO_LAST_MEETING : RECEIPT_UNAVAILABLE;
    return (
      <footer data-ui="workspace.receipts_panel" data-public-url="null" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        <DashedEmptySlot label={copy} question />
      </footer>
    );
  }

  return (
    <footer data-ui="workspace.receipts_panel" data-public-url="null" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {safe.map((row, index) => (
          <ReceiptMark
            key={row.id ?? row.citation ?? index}
            receipts={safe}
            index={index}
            openIndex={openIndex}
            onOpen={onOpen}
            onClose={onClose}
          />
        ))}
      </div>
    </footer>
  );
}
