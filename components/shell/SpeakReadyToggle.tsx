'use client';

import { SPEAK_RECEIPTS_KEY } from '@/src/web/speak-ready.js';

/**
 * Speak 1.5 meeting mode. Mounted by AppShell only while the meeting workspace is open.
 * Client-only — does not call a speak API.
 */
export function SpeakReadyToggle({
  ready,
  onChange,
}: {
  ready: boolean;
  onChange: (ready: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost speak-ready-toggle"
      data-ui="shell.speak_ready_toggle"
      aria-pressed={ready}
      aria-keyshortcuts={SPEAK_RECEIPTS_KEY}
      onClick={() => onChange(!ready)}
      title={
        ready
          ? 'Speak ready. Meeting body is 18/28. Press R for receipts.'
          : 'Speak off. Turn on to enlarge the meeting 1-pager.'
      }
      style={{
        borderColor: ready ? 'var(--amber-pulse)' : 'var(--line)',
        color: ready ? 'var(--amber-pulse)' : 'var(--ink-muted)',
      }}
    >
      <span className={`speak-ready-dot${ready ? ' is-on' : ''}`} aria-hidden="true" />
      {ready ? 'Speak ready' : 'Speak off'}
      {ready ? <kbd className="speak-ready-key">{SPEAK_RECEIPTS_KEY.toUpperCase()}</kbd> : null}
    </button>
  );
}
