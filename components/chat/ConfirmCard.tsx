'use client';

import { Badge } from '@/components/primitives/Badge';
import { ConfirmActions, type ConfirmOutcome } from '@/components/chat/ConfirmActions';
import { actionPath, confirmCardFields } from '@/src/web/dual-confirm.js';

export type ConfirmCardModel = {
  ui?: string;
  proposal_id: string;
  kind?: string;
  status?: string;
  db_status?: string;
  requires_role?: string;
  preview?: { title?: string; summary?: string } | null;
  expires_at?: string | null;
  idempotency_key?: string | null;
  actions?: Array<{ action: string; method?: string; path?: string }>;
};

export function ConfirmCard({
  card,
  highlighted,
  canConfirm,
  busy,
  outcome,
  onSelect,
  onConfirm,
  onReject,
}: {
  card: ConfirmCardModel;
  highlighted?: boolean;
  canConfirm: boolean;
  busy?: boolean;
  outcome?: ConfirmOutcome;
  onSelect?: (proposalId: string) => void;
  onConfirm: (proposalId: string, path: string, method: string) => void;
  onReject: (proposalId: string, path: string, method: string) => void;
}) {
  const fields = confirmCardFields(card);
  const proposalId = fields?.proposal_id;
  if (!fields || !proposalId) {
    return null;
  }
  const confirm = actionPath(fields.actions, 'confirm');
  const reject = actionPath(fields.actions, 'reject');
  const pending = fields.status === 'pending';
  const confirmed = outcome?.status === 'confirmed' && outcome.proposalId === proposalId;
  const select = () => onSelect?.(proposalId);
  const badgeTone = confirmed ? 'success' : pending ? 'default' : 'default';

  return (
    <article
      data-ui="chat.confirm_card"
      data-proposal-id={proposalId}
      data-confirm-twin="true"
      tabIndex={-1}
      className={`confirm-surface${highlighted ? ' confirm-pulse' : ''}`}
      onFocusCapture={select}
      onClick={select}
      style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 12,
        background: 'var(--paper)',
        display: 'grid',
        gap: 8,
      }}
    >
      <header style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>{fields.preview?.title ?? fields.kind}</strong>
        <Badge tone={badgeTone}>{confirmed ? 'confirmed' : fields.status}</Badge>
        <Badge>{fields.requires_role}</Badge>
      </header>
      {fields.preview?.summary ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>{fields.preview.summary}</p>
      ) : null}
      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '4px 12px',
          fontSize: 12,
          color: 'var(--ink-muted)',
        }}
      >
        <dt>proposal_id</dt>
        <dd className="tabular" style={{ margin: 0 }}>
          {proposalId}
        </dd>
        <dt>kind</dt>
        <dd style={{ margin: 0 }}>{fields.kind}</dd>
        <dt>status</dt>
        <dd style={{ margin: 0 }}>{confirmed ? 'confirmed' : fields.status}</dd>
        <dt>db_status</dt>
        <dd style={{ margin: 0 }}>{fields.db_status}</dd>
        <dt>requires_role</dt>
        <dd style={{ margin: 0 }}>{fields.requires_role}</dd>
        <dt>expires_at</dt>
        <dd className="tabular" style={{ margin: 0 }}>
          {fields.expires_at ?? '—'}
        </dd>
        <dt>idempotency_key</dt>
        <dd style={{ margin: 0 }}>{fields.idempotency_key ?? '—'}</dd>
      </dl>
      <ConfirmActions
        pending={pending}
        canConfirm={canConfirm}
        busy={busy}
        confirm={confirm}
        reject={reject}
        outcome={confirmed ? outcome : null}
        onSelect={select}
        onConfirm={(path, method) => onConfirm(proposalId, path, method)}
        onReject={(path, method) => onReject(proposalId, path, method)}
      />
    </article>
  );
}
