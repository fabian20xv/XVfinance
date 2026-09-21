'use client';

import { Badge } from '@/components/primitives/Badge';
import { ConfirmActions, type ConfirmOutcome } from '@/components/chat/ConfirmActions';
import { actionPath, resolveTwinOutcome, withNullPublicUrl } from '@/src/web/dual-confirm.js';
import { ReceiptFootnote } from '@/components/meeting/ReceiptFootnote';

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
  canReject = true,
  busy,
  outcome,
  actionError,
  onSelect,
  onConfirm,
  onReject,
}: {
  panel: DiffPanelModel;
  highlighted?: boolean;
  canConfirm: boolean;
  canReject?: boolean;
  busy?: boolean;
  outcome?: ConfirmOutcome | null;
  actionError?: { proposalId: string; message: string } | null;
  onSelect?: (proposalId: string) => void;
  onConfirm: (proposalId: string, path: string, method: string) => void;
  onReject: (proposalId: string, path: string, method: string) => void;
}) {
  const safe = withNullPublicUrl(panel) as DiffPanelModel;
  const confirm = actionPath(safe.actions, 'confirm');
  const reject = actionPath(safe.actions, 'reject');
  const pending = safe.status === 'pending' || safe.status === 'pending_confirm';
  const meetingSend = safe.kind === 'meeting_send';
  const resolved = resolveTwinOutcome(outcome, safe.proposal_id, safe.status);
  const terminal = resolved?.status === 'confirmed' || resolved?.status === 'rejected';
  const confirmed = resolved?.status === 'confirmed';
  const select = () => onSelect?.(safe.proposal_id);
  const error = actionError?.proposalId === safe.proposal_id ? actionError.message : null;

  return (
    <section
      data-ui="workspace.diff_confirm_panel"
      data-proposal-id={safe.proposal_id}
      data-confirm-twin="true"
      tabIndex={-1}
      className={`confirm-surface${highlighted ? ' confirm-pulse' : ''}`}
      onFocusCapture={select}
      onClick={select}
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
        <Badge tone={confirmed ? 'success' : 'default'}>{confirmed ? 'confirmed' : safe.status}</Badge>
        <span className="tabular" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          {safe.proposal_id}
        </span>
      </header>
      <DiffBody diff={safe.diff ?? safe.preview} />
      {meetingSend ? (
        <ReceiptFootnote
          receipts={Array.isArray(safe.receipts) ? (safe.receipts as never) : []}
          emptyReason="unavailable"
        />
      ) : null}
      <ConfirmActions
        pending={pending && !terminal}
        canConfirm={canConfirm}
        canReject={canReject}
        busy={busy}
        confirm={confirm}
        reject={reject}
        outcome={terminal ? resolved : null}
        error={error}
        persistTerminal={false}
        onSelect={select}
        onConfirm={(path, method) => onConfirm(safe.proposal_id, path, method)}
        onReject={(path, method) => onReject(safe.proposal_id, path, method)}
      />
    </section>
  );
}
