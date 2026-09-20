'use client';

import { Button } from '@/components/primitives/Button';
import { SCRATCHPAD_WATERMARK_SUBLINE } from '@/src/web/scratchpad-ui.js';

export function WorkspaceHeader({
  title,
  scratchpadOpen,
  onEnterScratchpad,
  onShowMeeting,
}: {
  title: string;
  asOf?: string | null;
  scratchpadOpen?: boolean;
  onEnterScratchpad?: () => void;
  onShowMeeting?: () => void;
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '14px 20px 10px',
        borderBottom: '1px solid var(--line)',
        minHeight: 40,
        position: 'relative',
        zIndex: 6,
        background: 'var(--surface)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <strong style={{ fontSize: 14, letterSpacing: '-0.01em' }}>{title}</strong>
        {scratchpadOpen ? <p className="ws-subline">{SCRATCHPAD_WATERMARK_SUBLINE}</p> : null}
      </div>
      <span style={{ flex: 1 }} />
      {onShowMeeting ? (
        <Button variant="ghost" onClick={onShowMeeting}>
          Meeting
        </Button>
      ) : null}
      {onEnterScratchpad && !scratchpadOpen ? (
        <Button variant="ghost" onClick={onEnterScratchpad}>
          Scratchpad
        </Button>
      ) : scratchpadOpen ? (
        <span className="badge">Scratchpad · explore</span>
      ) : null}
    </header>
  );
}
