'use client';

import { AsOfChip } from '@/components/scratchpad/AsOfChip';
import { GhostChartEmpty } from '@/components/scratchpad/GhostChartEmpty';
import { ImpactDeltaList, type ImpactPayload } from '@/components/scratchpad/ImpactDeltaList';
import { ScratchpadConfirmBar } from '@/components/scratchpad/ScratchpadConfirmBar';
import { ScratchpadWatermark } from '@/components/scratchpad/ScratchpadWatermark';

export function DraftVeil({
  open,
  dissolving,
  watermark,
  asOf,
  impact,
  busy,
  canPromote,
  onDiscard,
  onPromote,
}: {
  open: boolean;
  dissolving?: boolean;
  watermark?: string;
  asOf?: string | null;
  impact: ImpactPayload | null;
  busy?: boolean;
  canPromote: boolean;
  onDiscard: () => void;
  onPromote: () => void;
}) {
  if (!open && !dissolving) {
    return null;
  }
  return (
    <div
      className={`draft-veil scratch-mark${dissolving ? ' is-dissolving' : ''}`}
      data-ui="workspace.impact_scratchpad"
      data-source-of-truth="false"
      data-live="false"
    >
      <ScratchpadWatermark watermark={watermark} />
      <div style={{ padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <AsOfChip asOf={asOf} />
        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>veil over live workspace — not a tab</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'grid', gap: 16 }}>
        <GhostChartEmpty />
        <ImpactDeltaList impact={impact} />
      </div>
      <ScratchpadConfirmBar
        busy={busy}
        canPromote={canPromote}
        onDiscard={onDiscard}
        onPromote={onPromote}
      />
    </div>
  );
}
