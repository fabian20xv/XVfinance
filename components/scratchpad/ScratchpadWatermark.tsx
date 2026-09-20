import { SCRATCHPAD_WATERMARK } from '@/src/web/scratchpad-ui.js';

export function ScratchpadWatermark({
  watermark = SCRATCHPAD_WATERMARK,
}: {
  watermark?: string;
}) {
  return (
    <div
      data-source-of-truth="false"
      data-live="false"
      style={{
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ink-muted)',
        padding: '8px 16px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {watermark}
    </div>
  );
}
