'use client';

import { Button } from '@/components/primitives/Button';
import { CONFIRM_COPY } from '@/src/web/confirm-ui.js';

export function ScratchpadConfirmBar({
  busy,
  canPromote,
  pendingConfirm,
  onDiscard,
  onPromote,
  onConfirmChange,
  onDismissProposal,
}: {
  busy?: boolean;
  canPromote: boolean;
  pendingConfirm?: boolean;
  onDiscard: () => void;
  onPromote: () => void;
  onConfirmChange?: () => void;
  onDismissProposal?: () => void;
}) {
  return (
    <footer
      style={{
        display: 'flex',
        gap: 8,
        padding: 12,
        borderTop: '1px solid var(--line)',
        background: 'var(--surface)',
      }}
    >
      {pendingConfirm ? (
        <>
          <Button variant="accent" disabled={busy} onClick={onConfirmChange}>
            {CONFIRM_COPY.primary}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onDismissProposal}>
            {CONFIRM_COPY.secondary}
          </Button>
        </>
      ) : (
        <>
          <Button variant="ghost" disabled={busy} onClick={onDiscard}>
            Discard
          </Button>
          <Button variant="warn" disabled={busy || !canPromote} onClick={onPromote}>
            Promote
          </Button>
        </>
      )}
      <span style={{ fontSize: 11, color: 'var(--ink-muted)', alignSelf: 'center' }}>
        Promote → scratchpad_promote (manager dual-confirm). Discard exits with zero source-of-truth persistence.
      </span>
    </footer>
  );
}
