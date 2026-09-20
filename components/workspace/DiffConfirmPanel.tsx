'use client';

import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { actionPath, withNullPublicUrl } from '@/src/web/dual-confirm.js';
import { ReceiptSideSlip } from '@/components/meeting/ReceiptSideSlip';

export type DiffPanelModel = {
  ui?: string;
  proposal_id: string;
  kind?: string;
  status?: string;
  db_status?: string;
  requires_role?: string;
  preview?: Record<string, unknown>;
  diff?: unknown;
  payload?: Record<string, unknown>;
  expires_at?: string | null;
  actions?: Array<{ action: string; method?: string; path?: string }>;
  receipts?: unknown[];
  receipts_ui?: string;
  public_url?: null;
};

function DiffBody({ diff }: { diff: unknown }) {
  if (diff == null) {
    return <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 13 }}>No diff payload.</p>;
  }
  if (Array.isArray(diff)) {
    if (diff.length === 0) {
      return <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 13 }}>Empty diff.</p>;
    }
    return (
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
        {diff.map((row, index) => (
          <li key={index} className="tabular">
            {typeof row === 'object' ? JSON.stringify(row) : String(row)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof diff === 'object') {
    return (
      <pre
        className="tabular"
        style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}
      >
        {JSON.stringify(diff, null, 2)}
      </pre>
    );
  }
  return <p className="tabular" style={{ margin: 0, fontSize: 13 }}>{String(diff)}</p>;
}

export function DiffConfirmPanel({
  panel,
  highlighted,
  canConfirm,
  busy,
  onHover,
  onConfirm,
  onReject,
}: {
  panel: DiffPanelModel;
  highlighted?: boolean;
  canConfirm: boolean;
  busy?: boolean;
  onHover?: (proposalId: string) => void;
  onConfirm: (proposalId: string, path: string, method: string) => void;
  onReject: (proposalId: string, path: string, method: string) => void;
}) {
  const safe = withNullPublicUrl(panel) as DiffPanelModel;
  const confirm = actionPath(safe.actions, 'confirm');
  const reject = actionPath(safe.actions, 'reject');
  const pending = safe.status === 'pending';
  const meetingSend = safe.kind === 'meeting_send';

  return (
    <section
      data-ui="workspace.diff_confirm_panel"
      data-proposal-id={safe.proposal_id}
      className={highlighted ? 'cross-highlight' : undefined}
      onMouseEnter={() => onHover?.(safe.proposal_id)}
      style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 12,
        display: 'grid',
        gap: 8,
        background: 'var(--surface)',
      }}
    >
      <header style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>Workspace confirm</strong>
        <Badge tone="warn">{safe.status}</Badge>
        <span className="tabular" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          {safe.proposal_id}
        </span>
      </header>
      <DiffBody diff={safe.diff ?? safe.preview} />
      {meetingSend ? (
        <ReceiptSideSlip
          panel={{
            ui: 'workspace.receipts_panel',
            receipts: Array.isArray(safe.receipts) ? (safe.receipts as never) : [],
            public_url: null,
            report_id: typeof safe.payload?.report_id === 'string' ? safe.payload.report_id : null,
          }}
        />
      ) : null}
      <footer style={{ display: 'flex', gap: 8 }}>
        <Button
          variant="accent"
          disabled={!pending || !canConfirm || busy || !confirm}
          onClick={() => confirm && onConfirm(safe.proposal_id, confirm.path, confirm.method)}
        >
          Confirm
        </Button>
        <Button
          variant="danger"
          disabled={!pending || busy || !reject}
          onClick={() => reject && onReject(safe.proposal_id, reject.path, reject.method)}
        >
          Reject
        </Button>
      </footer>
    </section>
  );
}
