'use client';

import { Button } from '@/components/primitives/Button';
import { CONFIRM_COPY, terminalActionLine } from '@/src/web/confirm-ui.js';

export type ConfirmOutcome = {
  status: 'confirmed' | 'rejected' | 'failed';
  at: Date;
  proposalId: string;
};

export function ConfirmActions({
  pending,
  canConfirm,
  canReject = true,
  busy,
  confirm,
  reject,
  outcome,
  error,
  persistTerminal = false,
  onConfirm,
  onReject,
  onSelect,
}: {
  pending: boolean;
  canConfirm: boolean;
  canReject?: boolean;
  busy?: boolean;
  confirm: { path: string; method: string } | null;
  reject: { path: string; method: string } | null;
  outcome?: ConfirmOutcome | null;
  error?: string | null;
  persistTerminal?: boolean;
  onConfirm: (path: string, method: string) => void;
  onReject: (path: string, method: string) => void;
  onSelect: () => void;
}) {
  const terminal = outcome?.status === 'confirmed' || outcome?.status === 'rejected';
  if (terminal && outcome) {
    const dismissed = outcome.status === 'rejected';
    return (
      <p
        className={persistTerminal ? 'confirm-terminal-line' : 'confirm-success-line'}
        data-confirm-terminal={outcome.status}
        data-dismissed={dismissed ? 'true' : undefined}
      >
        {terminalActionLine(outcome.status, outcome.at)}
      </p>
    );
  }
  return (
    <footer style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
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
          disabled={!pending || !canReject || busy || !reject}
          onFocus={onSelect}
          onClick={() => reject && onReject(reject.path, reject.method)}
        >
          {CONFIRM_COPY.secondary}
        </Button>
      </div>
      {error ? (
        <p data-confirm-error="true" style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
    </footer>
  );
}
