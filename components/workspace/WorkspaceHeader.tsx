'use client';

import { Button } from '@/components/primitives/Button';
import { Badge } from '@/components/primitives/Badge';

export function WorkspaceHeader({
  title,
  asOf,
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
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderBottom: '1px solid var(--line)',
        minHeight: 40,
      }}
    >
      <strong style={{ fontSize: 13 }}>{title}</strong>
      {asOf ? (
        <Badge>
          as of {asOf}
        </Badge>
      ) : null}
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
      ) : null}
    </header>
  );
}
