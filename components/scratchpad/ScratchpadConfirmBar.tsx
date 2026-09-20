'use client';

import { Button } from '@/components/primitives/Button';

export function ScratchpadConfirmBar({
  busy,
  canPromote,
  onDiscard,
  onPromote,
}: {
  busy?: boolean;
  canPromote: boolean;
  onDiscard: () => void;
  onPromote: () => void;
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
      <Button variant="ghost" disabled={busy} onClick={onDiscard}>
        Discard
      </Button>
      <Button variant="warn" disabled={busy || !canPromote} onClick={onPromote}>
        Promote
      </Button>
      <span style={{ fontSize: 11, color: 'var(--ink-muted)', alignSelf: 'center' }}>
        Promote → scratchpad_promote (manager dual-confirm). Discard exits with zero source-of-truth persistence.
      </span>
    </footer>
  );
}
