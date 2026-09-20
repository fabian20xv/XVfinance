import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';
import { withNullPublicUrl } from '@/src/web/dual-confirm.js';

export type Receipt = {
  id?: string;
  citation?: string;
  source_table?: string;
  source_id?: string;
  label?: string;
  excerpt?: string;
  as_of?: string | null;
  path?: string;
  auditable?: boolean;
  public_url?: null;
};

export type ReceiptsPanel = {
  ui?: string;
  report_id?: string | null;
  receipts?: Receipt[];
  public_url?: null;
  status?: string;
};

export function ReceiptSideSlip({ panel }: { panel: ReceiptsPanel | null }) {
  if (!panel) {
    return <DashedEmptySlot label="No receipts panel" />;
  }
  const safe = withNullPublicUrl(panel) as ReceiptsPanel;
  const receipts = Array.isArray(safe.receipts) ? safe.receipts : [];
  return (
    <aside
      data-ui="workspace.receipts_panel"
      data-public-url="null"
      style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 12,
        background: 'var(--paper)',
        display: 'grid',
        gap: 8,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <strong>Receipts</strong>
        <span style={{ color: 'var(--ink-muted)' }}>public_url: null</span>
      </header>
      {receipts.length === 0 ? (
        <DashedEmptySlot label="No receipts on this 1-pager" />
      ) : (
        receipts.map((row) => (
          <div key={row.id ?? row.citation} style={{ fontSize: 12 }}>
            <div>
              [{row.citation}] {row.label}
            </div>
            <div style={{ color: 'var(--ink-muted)' }}>{row.excerpt}</div>
            <div className="tabular" style={{ color: 'var(--ink-muted)', fontSize: 11 }}>
              {row.source_table} · {row.path} · public_url: null
            </div>
          </div>
        ))
      )}
    </aside>
  );
}
