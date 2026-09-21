'use client';

import { ConfirmCard, type ConfirmCardModel } from '@/components/chat/ConfirmCard';
import type { ConfirmOutcome } from '@/components/chat/ConfirmActions';
import { Composer } from '@/components/chat/Composer';
import { ToolStatusPill } from '@/components/chat/ToolStatusPill';
import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  toolName?: string;
  toolStatus?: 'running' | 'ok' | 'error' | 'pending_confirm';
  confirmCard?: ConfirmCardModel | null;
};

export function ChatThread({
  messages,
  composer,
  onComposerChange,
  onSubmit,
  pendingConfirm,
  busy,
  highlightedProposalId,
  canConfirm,
  hideConfirmCard,
  pendingCard,
  outcome,
  onSelectProposal,
  onConfirm,
  onReject,
}: {
  messages: ChatMessage[];
  composer: string;
  onComposerChange: (value: string) => void;
  onSubmit: () => void;
  pendingConfirm?: boolean;
  busy?: boolean;
  highlightedProposalId?: string | null;
  canConfirm: boolean;
  hideConfirmCard?: boolean;
  pendingCard?: ConfirmCardModel | null;
  outcome?: ConfirmOutcome;
  onSelectProposal: (proposalId: string) => void;
  onConfirm: (proposalId: string, path: string, method: string) => void;
  onReject: (proposalId: string, path: string, method: string) => void;
}) {
  return (
    <section className="pane pane-chat" aria-label="Chat">
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'grid', gap: 12, alignContent: 'start' }}>
        {messages.length === 0 ? (
          <DashedEmptySlot
            label="No thread yet"
            hint="Ask in natural language. The agent uses allowlisted tools. Writes stay propose → confirm."
          />
        ) : (
          messages.map((message) => (
            <div key={message.id} style={{ display: 'grid', gap: 8 }}>
              <div
                style={{
                  justifySelf: message.role === 'user' ? 'end' : 'start',
                  maxWidth: '92%',
                  background: message.role === 'user' ? 'var(--accent-soft)' : 'var(--paper)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                }}
              >
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{message.role}</strong>
                  {message.toolStatus ? (
                    <ToolStatusPill status={message.toolStatus} name={message.toolName} />
                  ) : null}
                </div>
                {message.text}
              </div>
              {message.confirmCard && !hideConfirmCard ? (
                <ConfirmCard
                  card={message.confirmCard}
                  highlighted={highlightedProposalId === message.confirmCard.proposal_id}
                  canConfirm={canConfirm}
                  busy={busy}
                  outcome={outcome}
                  onSelect={onSelectProposal}
                  onConfirm={onConfirm}
                  onReject={onReject}
                />
              ) : null}
            </div>
          ))
        )}
        {pendingCard && !hideConfirmCard && !messages.some((row) => row.confirmCard?.proposal_id === pendingCard.proposal_id) ? (
          <ConfirmCard
            card={pendingCard}
            highlighted={highlightedProposalId === pendingCard.proposal_id}
            canConfirm={canConfirm}
            busy={busy}
            outcome={outcome}
            onSelect={onSelectProposal}
            onConfirm={onConfirm}
            onReject={onReject}
          />
        ) : null}
      </div>
      <Composer
        value={composer}
        onChange={onComposerChange}
        onSubmit={onSubmit}
        pendingConfirm={pendingConfirm}
        busy={busy}
      />
    </section>
  );
}
