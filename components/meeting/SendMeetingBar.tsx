'use client';

import { Button } from '@/components/primitives/Button';

export function SendMeetingBar({
  disabled,
  busy,
  onSend,
}: {
  disabled?: boolean;
  busy?: boolean;
  onSend: (channel: 'email' | 'export') => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Button variant="accent" disabled={disabled || busy} onClick={() => onSend('email')}>
        Email
      </Button>
      <Button disabled={disabled || busy} onClick={() => onSend('export')}>
        Export
      </Button>
      <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
        propose_meeting_send · manager confirm · public_url stays null
      </span>
    </div>
  );
}
