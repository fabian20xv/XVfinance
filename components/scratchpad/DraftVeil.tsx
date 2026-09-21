'use client';

import type { ReactNode } from 'react';
import { AsOfChip } from '@/components/scratchpad/AsOfChip';
import { ScratchpadConfirmBar } from '@/components/scratchpad/ScratchpadConfirmBar';
import { ScratchpadWatermark } from '@/components/scratchpad/ScratchpadWatermark';
import type { ImpactPayload } from '@/components/scratchpad/ImpactDeltaList';

export function DraftVeil({
  open,
  dissolving,
  success,
  asOf,
  portfolioId,
  busy,
  canPromote,
  pendingConfirm,
  panel,
  onDiscard,
  onPromote,
  onConfirmChange,
  onDismissProposal,
}: {
  open: boolean;
  dissolving?: boolean;
  success?: boolean;
  confirmed?: boolean;
  watermark?: string;
  asOf?: string | null;
  portfolioId?: string | null;
  impact?: ImpactPayload | null;
  busy?: boolean;
  canPromote: boolean;
  pendingConfirm?: boolean;
  panel?: ReactNode;
  onDiscard: () => void;
  onPromote: () => void;
  onConfirmChange?: () => void;
  onDismissProposal?: () => void;
}) {
  if (!open && !dissolving && !success) {
    return null;
  }
  const veilClass = [
    'draft-veil',
    dissolving && !success ? 'is-dissolving' : '',
    success ? 'is-success' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={veilClass}
      data-ui="workspace.impact_scratchpad"
      data-source-of-truth="false"
      data-live="false"
      aria-hidden="false"
    >
      <ScratchpadWatermark />
      <AsOfChip asOf={asOf} portfolioId={portfolioId} />
      {pendingConfirm && panel ? (
        <div className="veil-chrome" style={{ margin: '48px 16px 0', overflow: 'auto' }}>
          {panel}
        </div>
      ) : null}
      <div style={{ flex: 1 }} />
      <div className="veil-chrome">
        <ScratchpadConfirmBar
          busy={busy}
          canPromote={canPromote}
          pendingConfirm={pendingConfirm}
          onDiscard={onDiscard}
          onPromote={onPromote}
          onConfirmChange={onConfirmChange}
          onDismissProposal={onDismissProposal}
        />
      </div>
    </div>
  );
}
