'use client';

import type { ReactNode } from 'react';
import { AsOfChip } from '@/components/scratchpad/AsOfChip';
import { GhostChartEmpty } from '@/components/scratchpad/GhostChartEmpty';
import { ImpactDeltaList, type ImpactPayload } from '@/components/scratchpad/ImpactDeltaList';
import { ScratchpadConfirmBar } from '@/components/scratchpad/ScratchpadConfirmBar';
import { ScratchpadWatermark } from '@/components/scratchpad/ScratchpadWatermark';
import { SCRATCHPAD_WATERMARK_SUBLINE } from '@/src/web/scratchpad-ui.js';

export function DraftVeil({
  open,
  dissolving,
  success,
  confirmed,
  asOf,
  portfolioId,
  impact,
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
  impact: ImpactPayload | null;
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
    'scratch-mark',
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
    >
      <ScratchpadWatermark />
      <div style={{ padding: '8px 16px', display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <AsOfChip asOf={asOf} portfolioId={portfolioId} />
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)' }}>
          {SCRATCHPAD_WATERMARK_SUBLINE}
        </p>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'grid', gap: 16 }}>
        {panel}
        <GhostChartEmpty />
        <ImpactDeltaList impact={impact} confirmed={confirmed} />
      </div>
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
  );
}
