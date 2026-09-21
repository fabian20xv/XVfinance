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
  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask a portfolio question, or /get_session_context {json}"
        disabled={false}
        aria-disabled={false}
        data-unlocked-during-confirm={pendingConfirm ? 'true' : 'false'}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          {pendingConfirm
            ? 'Confirm pending — composer stays unlocked. Natural language → POST /v1/chat; /tool → /v1/tools.'
            : 'POST /v1/chat · /tool → /v1/tools · composer unlocked while confirm pending'}
        </span>
        <Button type="submit" variant="accent" disabled={busy || !value.trim()}>
          Send
        </Button>
      </div>
    </form>
  );
}
