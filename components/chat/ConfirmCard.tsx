'use client';

import { Badge } from '@/components/primitives/Badge';
import { ConfirmActions, type ConfirmOutcome } from '@/components/chat/ConfirmActions';
import { actionPath, confirmCardFields, resolveTwinOutcome } from '@/src/web/dual-confirm.js';

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

function roleLabel(role?: string | null) {
  if (role === 'manager') {
    return 'Manager';
  }
  if (role === 'any_member') {
    return 'Any member';
  }
  return role || null;
}

function expiresLabel(iso?: string | null) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ConfirmCard({
  card,
  highlighted,
  canConfirm,
  busy,
  outcome,
  actionError,
  canReject = true,
  onSelect,
  onConfirm,
  onReject,
}: {
  card: ConfirmCardModel;
  highlighted?: boolean;
  canConfirm: boolean;
  busy?: boolean;
  outcome?: ConfirmOutcome | null;
  actionError?: { proposalId: string; message: string } | null;
  canReject?: boolean;
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
  const pending = fields.status === 'pending' || fields.status === 'pending_confirm';
  const resolved = resolveTwinOutcome(outcome, proposalId, fields.status);
  const terminal = resolved?.status === 'confirmed' || resolved?.status === 'rejected';
  const select = () => onSelect?.(proposalId);
  const role = roleLabel(fields.requires_role);
  const expires = expiresLabel(fields.expires_at);
  const error = actionError?.proposalId === proposalId ? actionError.message : null;

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
        {role ? <Badge>{role}</Badge> : null}
      </header>
      {fields.preview?.summary ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>{fields.preview.summary}</p>
      ) : null}
      {expires ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)' }}>Expires {expires}</p>
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
        persistTerminal
        onSelect={select}
        onConfirm={(path, method) => onConfirm(proposalId, path, method)}
        onReject={(path, method) => onReject(proposalId, path, method)}
      />
    </article>
  );
}
