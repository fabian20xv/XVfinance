'use client';

import { Button } from '@/components/primitives/Button';

export function Composer({
  value,
  onChange,
  onSubmit,
  pendingConfirm,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pendingConfirm?: boolean;
  busy?: boolean;
}) {
  const send = () => {
    if (!busy && value.trim()) {
      onSubmit();
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask about this book, a holding, or a proposed change…"
        disabled={false}
        aria-disabled={false}
        data-unlocked-during-confirm={pendingConfirm ? 'true' : 'false'}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
            return;
          }
          event.preventDefault();
          send();
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          {pendingConfirm
            ? 'A proposal is waiting — you can keep chatting.'
            : 'Enter to send · Shift+Enter for a new line'}
        </span>
        <Button type="submit" variant="accent" disabled={busy || !value.trim()}>
          Send
        </Button>
      </div>
    </form>
  );
}
