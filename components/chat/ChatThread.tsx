'use client';

import { useLayoutEffect, useRef } from 'react';
import { ConfirmCard, type ConfirmCardModel } from '@/components/chat/ConfirmCard';
import type { ConfirmOutcome } from '@/components/chat/ConfirmActions';
import { Composer } from '@/components/chat/Composer';
import { ToolStatusPill } from '@/components/chat/ToolStatusPill';
import { MarketResultCard } from '@/components/market/MarketResultCard';
import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';
import { twinOutcome } from '@/src/web/dual-confirm.js';

export type ChatToolEvent = {
  id?: string;
  name?: string;
  status: 'running' | 'ok' | 'error' | 'pending_confirm';
  market?: Record<string, unknown> | null;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools?: ChatToolEvent[];
  confirmCard?: ConfirmCardModel | null;
};

function bubbleLabel(role: ChatMessage['role']) {
  return role === 'user' ? 'You' : 'XV';
}

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
  outcomes,
  actionError,
  canReject = true,
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
  outcomes?: Record<string, ConfirmOutcome>;
  actionError?: { proposalId: string; message: string } | null;
  canReject?: boolean;
  onSelectProposal: (proposalId: string) => void;
  onConfirm: (proposalId: string, path: string, method: string) => void;
  onReject: (proposalId: string, path: string, method: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  return (
    <section className="pane pane-chat" aria-label="Chat">
      <div
        ref={scrollerRef}
        style={{ flex: 1, overflow: 'auto', padding: 16, display: 'grid', gap: 12, alignContent: 'start' }}
      >
        {messages.length === 0 ? (
          <DashedEmptySlot
            label="No thread yet"
            hint="Ask about a portfolio, client, or meeting. Proposed changes wait for your confirm."
          />
        ) : (
          messages.map((message) => {
            const showCaret =
              message.role === 'assistant' && Boolean(busy) && !message.text.trim();
            return (
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
                    <strong style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{bubbleLabel(message.role)}</strong>
                  </div>
                  {message.text}
                  {showCaret ? <span className="stream-caret" aria-hidden="true" /> : null}
                  {message.role === 'assistant' && message.tools?.length ? (
                    <div
                      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: message.text || showCaret ? 8 : 0 }}
                    >
                      {message.tools.map((tool) => (
                        <ToolStatusPill
                          key={tool.id ?? tool.name ?? tool.status}
                          status={tool.status}
                          name={tool.name}
                        />
                      ))}
                    </div>
                  ) : null}
                  {message.role === 'assistant' && message.tools?.some((tool) => tool.market && tool.status === 'ok') ? (
                    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                      {message.tools.map((tool) =>
                        tool.market && tool.status === 'ok' ? (
                          <MarketResultCard
                            key={`market-${tool.id ?? tool.name}`}
                            name={tool.name}
                            payload={tool.market}
                          />
                        ) : null
                      )}
                    </div>
                  ) : null}
                </div>
                {message.confirmCard && !hideConfirmCard ? (
                  <ConfirmCard
                    card={message.confirmCard}
                    highlighted={highlightedProposalId === message.confirmCard.proposal_id}
                    canConfirm={canConfirm}
                    canReject={canReject}
                    busy={busy}
                    outcome={twinOutcome(outcomes, message.confirmCard.proposal_id)}
                    actionError={actionError}
                    onSelect={onSelectProposal}
                    onConfirm={onConfirm}
                    onReject={onReject}
                  />
                ) : null}
              </div>
            );
          })
        )}
        {pendingCard &&
        !hideConfirmCard &&
        !messages.some((row) => row.confirmCard?.proposal_id === pendingCard.proposal_id) ? (
          <ConfirmCard
            card={pendingCard}
            highlighted={highlightedProposalId === pendingCard.proposal_id}
            canConfirm={canConfirm}
            canReject={canReject}
            busy={busy}
            outcome={twinOutcome(outcomes, pendingCard.proposal_id)}
            actionError={actionError}
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
