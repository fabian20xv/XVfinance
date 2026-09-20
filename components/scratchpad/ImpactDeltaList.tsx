import { AmberPulseNumber } from '@/components/scratchpad/AmberPulseNumber';
import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';

export type ImpactPayload = {
  added?: unknown[];
  removed?: unknown[];
  changed?: Array<{
    symbol?: string;
    from_quantity?: number;
    to_quantity?: number;
  }>;
  unchanged?: unknown[];
};

function rowLabel(row: unknown) {
  if (!row || typeof row !== 'object') {
    return String(row);
  }
  const rec = row as { symbol?: string; quantity?: number };
  if (rec.symbol) {
    return `${rec.symbol}${rec.quantity != null ? ` · ${rec.quantity}` : ''}`;
  }
  return JSON.stringify(row);
}

export function ImpactDeltaList({
  impact,
}: {
  impact: ImpactPayload | null;
}) {
  if (!impact) {
    return (
      <DashedEmptySlot
        label="No impact yet"
        hint="GET /v1/scratchpads/:id/impact after a watermarked scratchpad exists."
      />
    );
  }
  const changed = impact.changed ?? [];
  const added = impact.added ?? [];
  const removed = impact.removed ?? [];
  if (changed.length + added.length + removed.length === 0) {
    return <DashedEmptySlot label="Impact is empty versus live holdings" />;
  }
  return (
    <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
      {changed.length > 0 ? (
        <section>
          <h3 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--ink-muted)' }}>Changed</h3>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {changed.map((row, index) => (
              <li key={index}>
                {row.symbol ?? 'instrument'}{' '}
                <span className="tabular">{row.from_quantity}</span>
                {' → '}
                <AmberPulseNumber value={row.to_quantity ?? '—'} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {added.length > 0 ? (
        <section>
          <h3 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--ink-muted)' }}>Added</h3>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {added.map((row, index) => (
              <li key={index}>
                <AmberPulseNumber value={rowLabel(row)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {removed.length > 0 ? (
        <section>
          <h3 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--ink-muted)' }}>Removed</h3>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {removed.map((row, index) => (
              <li key={index} className="tabular">
                {rowLabel(row)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
