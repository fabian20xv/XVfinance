export function GhostChartEmpty({ label = 'No live chart in scratchpad' }: { label?: string }) {
  return (
    <div>
      <div className="ghost-chart" aria-hidden="true" />
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>{label}</p>
    </div>
  );
}
