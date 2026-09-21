'use client';

import { Button } from '@/components/primitives/Button';
import { CONFIRM_COPY, confirmedLine } from '@/src/web/confirm-ui.js';

export type ConfirmOutcome = {
  status: 'confirmed' | 'failed';
  at: Date;
  proposalId: string;
} | null;

export function ConfirmActions({
  pending,
  canConfirm,
  busy,
  confirm,
  reject,
  outcome,
  onConfirm,
  onReject,
  onSelect,
}: {
  pending: boolean;
  canConfirm: boolean;
  busy?: boolean;
  confirm: { path: string; method: string } | null;
  reject: { path: string; method: string } | null;
  outcome?: ConfirmOutcome;
  onConfirm: (path: string, method: string) => void;
  onReject: (path: string, method: string) => void;
  onSelect: () => void;
}) {
  if (outcome?.status === 'confirmed') {
    return <p className="confirm-success-line">{confirmedLine(outcome.at)}</p>;
  }
  return (
    <footer style={{ display: 'flex', gap: 8 }}>
      <Button
        variant="accent"
        data-confirm-control="true"
        disabled={!pending || !canConfirm || busy || !confirm}
        onFocus={onSelect}
        onClick={() => confirm && onConfirm(confirm.path, confirm.method)}
      >
        {CONFIRM_COPY.primary}
      </Button>
      <Button
        variant="ghost"
        data-dismiss-control="true"
        disabled={!pending || busy || !reject}
        onFocus={onSelect}
        onClick={() => reject && onReject(reject.path, reject.method)}
      >
        {CONFIRM_COPY.secondary}
      </Button>
    </footer>
  );
}
