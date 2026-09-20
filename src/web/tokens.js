/**
 * Dana design pack v1.2 — locked tokens for the E10 split-screen shell.
 * Copy/motion sharpened (Rio); inventory unchanged. Do not invent colors.
 * Sketch teal #0D9488 loses to accent #0F6E6A.
 */

export const DANA_VERSION = '1.2';

export const TOKENS = Object.freeze({
  ink: '#0B1220',
  inkMuted: '#5B657A',
  paper: '#F7F8FA',
  surface: '#FFF',
  line: '#E6E9EF',
  accent: '#0F6E6A',
  accentSoft: '#E6F4F3',
  warn: '#B45309',
  amberPulse: '#D97706',
  danger: '#B42318',
  success: '#067647',
  draftVeil: 'rgba(244,241,232,0.72)',
  /** Cool-tint overlay: locked accent #0F6E6A at ~12%, not sketch #0D9488. */
  veilTint: 'rgba(15,110,106,0.12)',
  scratchMark: '#9A8F7A',
  scratchMarkAlpha: 0.1,
});

export const CHROME = Object.freeze({
  topBarPx: 48,
  gridPx: 8,
  radiusPx: 10,
  fontFamily: 'Inter, system-ui, sans-serif',
  dataVariant: 'tabular-nums',
  navRail: false,
});

export const SPLIT = Object.freeze({
  defaultChatPct: 56,
  minChatPct: 48,
  maxChatPct: 64,
  workspacePctAtDefault: 44,
});

export const MOTION = Object.freeze({
  crossHighlightMs: 600,
  confirmPulseEase: 'ease-out',
  scratchpadDissolveMs: 200,
  successFadeMs: 1200,
  receiptSlipMs: 140,
  receiptRisePx: 2,
  receiptSlipShiftPx: 8,
  amberPulseMs: 500,
  confirmedDeltaMs: 800,
});
