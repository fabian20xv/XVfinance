import { DataTable } from '@/components/primitives/DataTable';
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
}: {
  holdings: HoldingRow[] | null;
  cash: CashStrip | null;
}) {
  if (!holdings) {
    return (
      <DashedEmptySlot
        label="No portfolio selected"
        hint="Set workspace focus to a portfolio to load holdings. PII is never invented."
      />
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <CashCell label="Cash" value={money(cash?.cash_balance, cash?.cash_currency)} />
        <CashCell label="Liquidity available" value={money(cash?.liquidity_available, cash?.cash_currency)} />
        <CashCell label="Liquidity buffer" value={money(cash?.liquidity_buffer, cash?.cash_currency)} />
      </div>
      <DataTable
        columns={[
          { key: 'label', header: 'Symbol' },
          { key: 'instrument_name', header: 'Instrument' },
          { key: 'quantity', header: 'Qty', numeric: true },
        ]}
        rows={holdings as Array<Record<string, unknown>>}
        empty="No holdings for this portfolio"
      />
    </div>
  );
}

function CashCell({ label, value }: { label: string; value: string }) {
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
        {value}
      </div>
    </div>
  );
}
