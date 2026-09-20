import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { confirmCard, workspacePanel } from '../src/proposals/contracts.js';
import { receiptsPanel } from '../src/meetings/receipts.js';
import { getPublicSupabaseConfig } from '../src/client/public-config.js';
import { restoreXvPath } from '../src/server/fetch-xv-path.js';
import { createFetchHandler } from '../src/server/fetch-adapter.js';
import { assertSharedProposalId, confirmCardFields, withNullPublicUrl } from '../src/web/dual-confirm.js';
import { parseComposerInput } from '../src/web/parse-composer.js';
import { discardedScratchpadState, scratchpadOverlay, SCRATCHPAD_EXIT_MS, SCRATCHPAD_FAIL_TOAST, SCRATCHPAD_WATERMARK_DISPLAY, SCRATCHPAD_WATERMARK_SUBLINE, formatAsOfChip } from '../src/web/scratchpad-ui.js';
import { clampChatPct, resetChatPct, workspacePct } from '../src/web/split.js';
import { CHROME, DANA_VERSION, MOTION, SPLIT, TOKENS } from '../src/web/tokens.js';
import { confirmedLine, CONFIRM_COPY, isUnreadEdgeClipped } from '../src/web/confirm-ui.js';
import { focusEntityLabel, receiptBodyLine, receiptMark, receiptTitle, RECEIPT_NO_LAST_MEETING, RECEIPT_UNAVAILABLE, relativeTime } from '../src/web/receipt-ui.js';
import { SMOKE_PROPOSAL_ID } from '../src/db/smoke-ids.js';
import { ALLOWED_SUPABASE_URL } from '../src/config/supabase-lock.js';
import { SCRATCHPAD_WATERMARK } from '../src/scratchpad/contract.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARENT_URL = 'https://krcwpupbdizzjyydzaqp.supabase.co';
const DEVELOP_URL = 'https://bkwhqfkosxnoffpsjcug.supabase.co';

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('E10 Dana v1.2 split-screen shell', () => {
  it('locks Dana tokens, chrome, split, and motion', () => {
    assert.equal(DANA_VERSION, '1.2');
    assert.equal(TOKENS.ink, '#0B1220');
    assert.equal(TOKENS.inkMuted, '#5B657A');
    assert.equal(TOKENS.paper, '#F7F8FA');
    assert.equal(TOKENS.surface, '#FFF');
    assert.equal(TOKENS.line, '#E6E9EF');
    assert.equal(TOKENS.accent, '#0F6E6A');
    assert.equal(TOKENS.accentSoft, '#E6F4F3');
    assert.equal(TOKENS.warn, '#B45309');
    assert.equal(TOKENS.amberPulse, '#D97706');
    assert.equal(TOKENS.danger, '#B42318');
    assert.equal(TOKENS.success, '#067647');
    assert.equal(TOKENS.draftVeil, 'rgba(244,241,232,0.72)');
    assert.equal(TOKENS.veilTint, 'rgba(15,110,106,0.12)');
    assert.equal(TOKENS.scratchMark, '#9A8F7A');
    assert.equal(TOKENS.scratchMarkAlpha, 0.1);
    assert.equal(CHROME.topBarPx, 48);
    assert.equal(CHROME.gridPx, 8);
    assert.equal(CHROME.radiusPx, 10);
    assert.equal(CHROME.navRail, false);
    assert.equal(SPLIT.defaultChatPct, 56);
    assert.equal(SPLIT.workspacePctAtDefault, 44);
    assert.equal(MOTION.crossHighlightMs, 600);
    assert.equal(MOTION.confirmPulseEase, 'ease-out');
    assert.equal(MOTION.scratchpadDissolveMs, 200);
    assert.equal(MOTION.successFadeMs, 1200);
    assert.equal(MOTION.receiptSlipMs, 140);
    assert.equal(MOTION.receiptRisePx, 2);
    assert.equal(MOTION.receiptSlipShiftPx, 8);
    assert.equal(MOTION.amberPulseMs, 500);
    assert.equal(MOTION.confirmedDeltaMs, 800);
    assert.equal(SCRATCHPAD_EXIT_MS, 200);
  });

  it('clamps chat split 48–64 and resets to 56', () => {
    assert.equal(clampChatPct(56), 56);
    assert.equal(workspacePct(56), 44);
    assert.equal(clampChatPct(40), 48);
    assert.equal(clampChatPct(90), 64);
    assert.equal(resetChatPct(), 56);
  });

  it('parses composer tool calls and does not invent a model API', () => {
    assert.deepEqual(parseComposerInput('/get_session_context'), {
      type: 'tool',
      name: 'get_session_context',
      args: {},
    });
    assert.equal(parseComposerInput('hello team').type, 'message');
    assert.equal(parseComposerInput('{"name":"list_clients","args":{}}').name, 'list_clients');
  });

  it('shares proposal_id across ConfirmCard and DiffConfirmPanel fields', () => {
    const proposal = {
      id: SMOKE_PROPOSAL_ID,
      kind: 'holding_changes',
      status: 'pending_confirm',
      requires_role: 'manager',
      preview: { title: 'Holding changes', diff: [{ op: 'upsert' }] },
      payload: {},
      expires_at: '2099-01-01T00:00:00.000Z',
      idempotency_key: 'e10',
    };
    const card = confirmCard(proposal);
    const panel = workspacePanel(proposal);
    assert.equal(card.ui, 'chat.confirm_card');
    assert.equal(panel.ui, 'workspace.diff_confirm_panel');
    assert.equal(assertSharedProposalId(card, panel), SMOKE_PROPOSAL_ID);
    const fields = confirmCardFields(card);
    for (const key of [
      'proposal_id',
      'kind',
      'status',
      'db_status',
      'requires_role',
      'preview',
      'expires_at',
      'idempotency_key',
      'actions',
    ]) {
      assert.ok(key in fields, key);
    }
    assert.equal(fields.actions[0].path, `/v1/proposals/${SMOKE_PROPOSAL_ID}/confirm`);
    assert.equal(fields.actions[1].path, `/v1/proposals/${SMOKE_PROPOSAL_ID}/reject`);
  });

  it('forces public_url null on meeting receipts and workspace meeting panels', () => {
    const meeting = workspacePanel({
      id: SMOKE_PROPOSAL_ID,
      kind: 'meeting_send',
      status: 'pending_confirm',
      requires_role: 'manager',
      preview: { receipts: [{ id: 'r1', public_url: 'https://evil.example/share' }] },
      payload: { receipts: [{ id: 'r1' }] },
    });
    assert.equal(meeting.public_url, null);
    const safe = withNullPublicUrl(meeting);
    assert.equal(safe.public_url, null);
    assert.equal(safe.receipts[0].public_url, null);
    const panel = receiptsPanel({
      id: 'rep',
      receipts: [{ id: 'r1', public_url: 'nope' }],
      status: 'draft',
    });
    assert.equal(panel.ui, 'workspace.receipts_panel');
    assert.equal(panel.public_url, null);
  });

  it('scratchpad overlay is a veil, not live, not source of truth', () => {
    const overlay = scratchpadOverlay({ id: 'sp' });
    assert.equal(overlay.live, false);
    assert.equal(overlay.source_of_truth, false);
    assert.equal(overlay.watermark, SCRATCHPAD_WATERMARK);
    assert.equal(discardedScratchpadState().persisted, false);
  });

  it('public web config prefers NEXT_PUBLIC URL and refuses develop in production', () => {
    const preview = getPublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: DEVELOP_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      APP_ENV: 'preview',
    });
    assert.equal(preview.url, DEVELOP_URL);
    assert.equal(preview.ref, 'bkwhqfkosxnoffpsjcug');

    const prod = getPublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: PARENT_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      VERCEL_ENV: 'production',
    });
    assert.equal(prod.url, PARENT_URL);

    assert.throws(
      () =>
        getPublicSupabaseConfig({
          NEXT_PUBLIC_SUPABASE_URL: DEVELOP_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
          VERCEL_ENV: 'production',
        }),
      /develop\/staging Supabase ref/
    );
  });

  it('fetch adapter serves /health through createRequestListener', async () => {
    const handler = createFetchHandler({
      env: {
        SUPABASE_URL: ALLOWED_SUPABASE_URL,
        SUPABASE_ANON_KEY: 'anon-key',
      },
    });
    const response = await handler(new Request('http://127.0.0.1/health'));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.project_ref, 'krcwpupbdizzjyydzaqp');
  });

  it('restores vercel.json xv_path onto the Fetch request', () => {
    const request = restoreXvPath(
      new Request('http://127.0.0.1/api?xv_path=/v1/session&status=pending')
    );
    const url = new URL(request.url);
    assert.equal(url.pathname, '/v1/session');
    assert.equal(url.searchParams.get('status'), 'pending');
    assert.equal(url.searchParams.get('xv_path'), null);
  });

  it('vercel.json keeps API rewrites and does not swallow / for the App Router', () => {
    const config = JSON.parse(read('vercel.json'));
    const sources = config.rewrites.map((rule) => rule.source);
    assert.ok(sources.includes('/v1/:path*'));
    assert.ok(sources.includes('/health'));
    assert.ok(sources.includes('/api/health'));
    assert.equal(sources.includes('/(.*)'), false);
  });

  it('ships the Dana shell components and AuthGate', () => {
    const required = [
      'app/page.tsx',
      'app/layout.tsx',
      'components/shell/AppShell.tsx',
      'components/shell/FirmContextBar.tsx',
      'components/shell/FocusChip.tsx',
      'components/shell/AuthGate.tsx',
      'components/shell/SpeakReadyToggle.tsx',
      'components/chat/ChatThread.tsx',
      'components/chat/ToolStatusPill.tsx',
      'components/chat/ConfirmCard.tsx',
      'components/chat/ConfirmActions.tsx',
      'components/chat/Composer.tsx',
      'components/workspace/WorkspaceHeader.tsx',
      'components/workspace/HoldingsTable.tsx',
      'components/workspace/ReportDraftView.tsx',
      'components/workspace/EmptyWorkspace.tsx',
      'components/workspace/DiffConfirmPanel.tsx',
      'components/workspace/DashedEmptySlot.tsx',
      'components/scratchpad/DraftVeil.tsx',
      'components/scratchpad/ScratchpadWatermark.tsx',
      'components/scratchpad/AsOfChip.tsx',
      'components/scratchpad/AmberPulseNumber.tsx',
      'components/scratchpad/GhostChartEmpty.tsx',
      'components/scratchpad/ImpactDeltaList.tsx',
      'components/scratchpad/ScratchpadConfirmBar.tsx',
      'components/meeting/MeetingOnePager.tsx',
      'components/meeting/ReceiptFootnote.tsx',
      'components/meeting/ReceiptSideSlip.tsx',
      'components/meeting/SendMeetingBar.tsx',
      'components/primitives/Button.tsx',
      'components/primitives/Badge.tsx',
      'components/primitives/DataTable.tsx',
      'components/primitives/Toast.tsx',
      'components/primitives/Modal.tsx',
    ];
    for (const rel of required) {
      assert.ok(existsSync(join(root, rel)), rel);
    }
    const card = read('components/chat/ConfirmCard.tsx');
    assert.match(card, /chat\.confirm_card/);
    assert.match(card, /proposal_id/);
    assert.match(card, /confirm-pulse/);
    assert.equal(card.includes('onMouseEnter'), false);
    assert.equal(card.includes('onHover'), false);
    const actions = read('components/chat/ConfirmActions.tsx');
    assert.match(actions, /CONFIRM_COPY/);
    assert.match(actions, /confirmedLine/);
    const panel = read('components/workspace/DiffConfirmPanel.tsx');
    assert.match(panel, /workspace\.diff_confirm_panel/);
    assert.match(panel, /confirm-pulse/);
    assert.equal(panel.includes('onMouseEnter'), false);
    const composer = read('components/chat/Composer.tsx');
    assert.match(composer, /unlocked-during-confirm/);
    const veil = read('components/scratchpad/DraftVeil.tsx');
    assert.match(veil, /source-of-truth="false"/);
    const header = read('components/workspace/WorkspaceHeader.tsx');
    assert.match(header, /SCRATCHPAD_WATERMARK_SUBLINE/);
    const watermark = read('components/scratchpad/ScratchpadWatermark.tsx');
    assert.match(watermark, /SCRATCHPAD_WATERMARK_DISPLAY/);
    const receipts = read('components/meeting/ReceiptSideSlip.tsx');
    assert.match(receipts, /data-public-url="null"/);
    assert.match(receipts, /receipt-slip/);
    assert.match(receipts, /slip-kicker/);
    assert.match(receipts, /↑↓/);
    const footnote = read('components/meeting/ReceiptFootnote.tsx');
    assert.match(read('components/workspace/DashedEmptySlot.tsx'), /\[\?\]/);
    assert.match(footnote, /question/);
    assert.equal(footnote.includes('Citations'), false);
    assert.equal(footnote.includes('cited'), false);
    const shell = read('components/shell/AppShell.tsx');
    assert.equal(shell.includes('SpeakReadyToggle'), false);
    assert.match(shell, /hideConfirmCard=\{scratchpad\.open\}/);
    const chip = read('components/shell/FocusChip.tsx');
    assert.match(chip, /focus-chip/);
    const css = read('app/globals.css');
    assert.match(css, /#0f6e6a/i);
    assert.equal(css.includes('#0D9488'), false);
    assert.match(css, /--chrome-height: 48px/);
    assert.match(css, /--veil-tint/);
    assert.match(css, /confirm-inhale/);
    assert.match(css, /ease-out/);
    assert.match(css, /amber-pulse-once/);
    assert.match(css, /veil-dissolve-up/);
    assert.match(css, /rotate\(-28deg\)/);
    assert.match(css, /translate\(8px, 2px\)/);
    assert.equal(css.includes('infinite'), false);
  });

  it('confirm pulse copy, success line, and clipped unread-edge helper', () => {
    assert.equal(CONFIRM_COPY.primary, 'Confirm change');
    assert.equal(CONFIRM_COPY.secondary, 'Dismiss proposal');
    assert.match(confirmedLine(new Date('2026-09-20T16:05:00')), /Confirmed · .+ · you/);
    assert.equal(isUnreadEdgeClipped({ top: -8, bottom: 40 }, { top: 0, bottom: 100 }), true);
    assert.equal(isUnreadEdgeClipped({ top: 10, bottom: 40 }, { top: 0, bottom: 100 }), false);
  });

  it('scratchpad UI copy is DRAFT · what-if without changing the API watermark', () => {
    const overlay = scratchpadOverlay({ id: 'sp' });
    assert.equal(overlay.watermark, SCRATCHPAD_WATERMARK);
    assert.equal(SCRATCHPAD_WATERMARK_DISPLAY, 'DRAFT · what-if');
    assert.equal(SCRATCHPAD_WATERMARK_SUBLINE, "Won't change positions until you confirm.");
    assert.equal(SCRATCHPAD_FAIL_TOAST, 'Not applied — still draft.');
    assert.match(formatAsOfChip('2026-09-20T15:04:00Z', 'abcd-efgh'), /as of \d{2}:\d{2} · pf·abcd/);
  });

  it('receipt marks are [1] / dashed [?], never invented, FocusChip names the entity', () => {
    assert.equal(receiptMark(0), '[1]');
    assert.equal(receiptMark(-1, true), '[?]');
    assert.equal(RECEIPT_UNAVAILABLE, 'Not available for this account');
    assert.equal(RECEIPT_NO_LAST_MEETING, 'No last meeting on file');
    assert.equal(receiptTitle({ source_table: 'notes', as_of: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }).startsWith('Note · '), true);
    assert.equal(receiptBodyLine({ excerpt: 'Held 12 NVDA\nmore' }), 'Held 12 NVDA');
    assert.equal(receiptBodyLine({}), '');
    assert.equal(relativeTime(new Date(Date.now() - 90 * 1000).toISOString()), '2m ago');
    assert.equal(focusEntityLabel('NVDA', 'impact'), 'NVDA · impact');
  });
});
