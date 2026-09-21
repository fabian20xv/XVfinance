'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/primitives/Button';

type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
};

export function Modal({ open, title, children, onClose, footer }: ModalProps) {
  if (!open) {
    return null;
  }
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="modal-title" style={{ margin: '0 0 8px', fontSize: 16 }}>
          {title}
        </h2>
        <div style={{ color: 'var(--ink)', fontSize: 13 }}>{children}</div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {footer ?? (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
