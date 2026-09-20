'use client';

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
      title="Local speak-ready chrome. No E0–E9 speak API."
      style={{
        borderColor: ready ? 'var(--amber-pulse)' : 'var(--line)',
        color: ready ? 'var(--amber-pulse)' : 'var(--ink-muted)',
      }}
    >
      {ready ? 'Speak ready' : 'Speak off'}
    </button>
  );
}
