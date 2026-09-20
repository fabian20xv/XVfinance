import { AmberPulseNumber } from '@/components/scratchpad/AmberPulseNumber';
import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';

export type HoldingRow = {
  id: string;
  label?: string;
  instrument_name?: string | null;
  instrument_id?: string | null;
  quantity?: number | null;
};

export type CashStrip = {
  cash_balance?: number | null;
  cash_currency?: string | null;
  liquidity_available?: number | null;
  liquidity_buffer?: number | null;
};

function money(value: number | null | undefined, currency?: string | null) {
  if (value == null || Number.isNaN(Number(value))) {
    return '—';
  }
  const amount = Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return currency ? `${amount} ${currency}` : amount;
}

export function HoldingsTable({
  holdings,
  cash,
  pulseSymbols = [],
  pulseCash = false,
}: {
  holdings: HoldingRow[] | null;
  cash: CashStrip | null;
  pulseSymbols?: string[];
  pulseCash?: boolean;
}) {
  if (!holdings) {
    return (
      <DashedEmptySlot
        label="No portfolio selected"
        hint="Set workspace focus to a portfolio to load holdings. PII is never invented."
      />
    );
  }
  const pulsed = new Set(pulseSymbols.map((row) => row.toUpperCase()));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <CashCell
          label="Cash"
          value={money(cash?.cash_balance, cash?.cash_currency)}
          pulse={pulseCash}
        />
        <CashCell label="Liquidity available" value={money(cash?.liquidity_available, cash?.cash_currency)} />
        <CashCell label="Liquidity buffer" value={money(cash?.liquidity_buffer, cash?.cash_currency)} />
      </div>
      <div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--ink-muted)',
            marginBottom: 12,
            fontWeight: 500,
          }}
        >
          Holdings
        </div>
        {holdings.length === 0 ? (
          <DashedEmptySlot label="No holdings for this portfolio" />
        ) : (
          holdings.map((row) => {
            const pulse = Boolean(row.label && pulsed.has(row.label.toUpperCase()));
            return (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--line)',
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontWeight: 560, letterSpacing: '-0.01em' }}>{row.label ?? '—'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{row.instrument_name ?? ''}</div>
                </div>
                <div className="tabular" style={{ textAlign: 'right' }}>
                  {pulse ? <AmberPulseNumber value={row.quantity ?? '—'} /> : row.quantity ?? '—'}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CashCell({ label, value, pulse }: { label: string; value: string; pulse?: boolean }) {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 8,
        background: 'var(--paper)',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div className="tabular" style={{ fontSize: 16, marginTop: 4 }}>
        {pulse ? <AmberPulseNumber value={value} /> : value}
      </div>
    </div>
  );
}
