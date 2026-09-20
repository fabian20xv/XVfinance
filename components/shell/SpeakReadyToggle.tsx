'use client';

/**
 * Deferred to epic 1.5 — kept in inventory, not mounted in AppShell (Dana v1.2).
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
      className="btn btn-ghost"
      aria-pressed={ready}
      onClick={() => onChange(!ready)}
      title="Deferred to epic 1.5. No E0–E9 speak API."
      style={{
        borderColor: ready ? 'var(--amber-pulse)' : 'var(--line)',
        color: ready ? 'var(--amber-pulse)' : 'var(--ink-muted)',
      }}
    >
      {ready ? 'Speak ready' : 'Speak off'}
    </button>
  );
}
