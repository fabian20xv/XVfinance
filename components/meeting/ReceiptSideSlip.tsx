'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  RECEIPT_OPEN_WORKSPACE,
  RECEIPT_UNAVAILABLE,
  receiptBodyLine,
  receiptDeepLink,
  receiptMark,
  receiptTitle,
} from '@/src/web/receipt-ui.js';

export type Receipt = {
  id?: string;
  citation?: string;
  source_table?: string;
  source_id?: string;
  label?: string;
  excerpt?: string;
  as_of?: string | null;
  path?: string;
  auditable?: boolean;
  public_url?: null;
};

export type ReceiptsPanel = {
  ui?: string;
  report_id?: string | null;
  receipts?: Receipt[];
  public_url?: null;
  status?: string;
};

export function ReceiptSideSlip({
  receipt,
  index,
  total,
  flip,
  onClose,
  onStep,
}: {
  receipt: Receipt;
  index: number;
  total: number;
  flip?: boolean;
  onClose: () => void;
  onStep?: (delta: number) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [index]);

  const deepLink = receiptDeepLink(receipt);
  const body = receiptBodyLine(receipt);

  return (
    <aside
      ref={ref as never}
      data-ui="workspace.receipts_panel"
      data-public-url="null"
      className={`receipt-slip${flip ? ' is-flip' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-label={receiptTitle(receipt)}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onStep?.(-1);
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          onStep?.(1);
        }
      }}
    >
      <div className="slip-nav" aria-hidden="true">
        ↑↓
      </div>
      <div className="slip-kicker">Receipt</div>
      <div className="slip-title">{receiptTitle(receipt)}</div>
      <p className="slip-body">{body || RECEIPT_UNAVAILABLE}</p>
      {deepLink ? (
        <a href={deepLink} className="slip-action">
          {RECEIPT_OPEN_WORKSPACE} →
        </a>
      ) : null}
    </aside>
  );
}

export function ReceiptMark({
  receipts,
  index,
  missing,
  openIndex,
  onOpen,
  onClose,
}: {
  receipts: Receipt[];
  index: number;
  missing?: boolean;
  openIndex: number | null;
  onOpen: (index: number) => void;
  onClose: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const [flip, setFlip] = useState(false);
  const receipt = !missing && index >= 0 ? receipts[index] : null;
  const open = openIndex === index && Boolean(receipt);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      return;
    }
    const rect = wrapRef.current.getBoundingClientRect();
    setFlip(rect.right + 288 > window.innerWidth - 8);
  }, [open]);

  const closeAndRestore = () => {
    onClose();
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  if (missing || !receipt) {
    return (
      <span
        className="receipt-mark is-missing"
        title={RECEIPT_UNAVAILABLE}
        aria-label={RECEIPT_UNAVAILABLE}
      >
        {receiptMark(index, true)}
      </span>
    );
  }

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        className={`receipt-mark${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            closeAndRestore();
          } else {
            onOpen(index);
          }
        }}
      >
        {receiptMark(index)}
      </button>
      {open ? (
        <ReceiptSideSlip
          receipt={receipt}
          index={index}
          total={receipts.length}
          flip={flip}
          onClose={closeAndRestore}
          onStep={(delta) => {
            const next = index + delta;
            if (next >= 0 && next < receipts.length) {
              onOpen(next);
            }
          }}
        />
      ) : null}
    </span>
  );
}
