import { SCRATCHPAD_WATERMARK_DISPLAY } from '@/src/web/scratchpad-ui.js';

export function ScratchpadWatermark({
  phrase = SCRATCHPAD_WATERMARK_DISPLAY,
}: {
  phrase?: string;
  watermark?: string;
}) {
  return (
    <div
      className="scratch-watermark-diagonal"
      data-source-of-truth="false"
      data-live="false"
      aria-hidden="true"
    >
      {phrase}
    </div>
  );
}
