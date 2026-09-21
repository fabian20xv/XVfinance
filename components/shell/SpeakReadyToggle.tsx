'use client';

import { SPEAK_RECEIPTS_KEY } from '@/src/web/speak-ready.js';

const OFF_LABEL = 'Speak off — enlarge 1-pager for screenshare';
const ON_LABEL = 'Speak ready — press R to open receipts';

/**
 * Speak 1.5 meeting mode. Mounted by AppShell only while the meeting workspace is open.
 * Client-only — no speak API, no voice or mic.
 */
export function SpeakReadyToggle({
  ready,
  onChange,
}: {
  ready: boolean;
  onChange: (ready: boolean) => void;
}) {
  const label = ready ? ON_LABEL : OFF_LABEL;
  return (
    <button
      type="button"
      className={`btn btn-ghost speak-ready-toggle${ready ? ' is-on' : ''}`}
      data-ui="shell.speak_ready_toggle"
      aria-pressed={ready}
      aria-label={label}
      aria-keyshortcuts={SPEAK_RECEIPTS_KEY}
      onClick={() => onChange(!ready)}
      title={label}
      style={{
        borderColor: ready ? 'var(--amber-pulse)' : 'var(--line)',
        color: ready ? 'var(--amber-pulse)' : 'var(--ink-muted)',
      }}
    >
      {ready ? 'Speak ready' : 'Speak off'}
    </button>
  );
}
