/**
 * Dana design pack v1.1 — locked tokens for the E10 split-screen shell.
 * Do not invent colors. Chrome is 48px, 8px grid, 10px radius.
 */

export const DANA_VERSION = '1.1';

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
  scratchMark: '#9A8F7A',
  scratchMarkAlpha: 0.12,
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
  scratchpadDissolveMs: 200,
});
