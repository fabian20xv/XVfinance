import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SPEAK_EMPTY_RECEIPTS,
  SPEAK_READY_BODY,
  SPEAK_READY_CHROME_ALPHA,
  SPEAK_RECEIPTS_KEY,
  resolveSpeakReady,
  speakReceiptShortcut,
} from '../src/web/speak-ready.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Speak 1.5 speak-ready meeting mode', () => {
  it('stays off unless the meeting workspace is open', () => {
    assert.equal(SPEAK_READY_BODY.fontSizePx, 18);
    assert.equal(SPEAK_READY_BODY.lineHeightPx, 28);
    assert.equal(SPEAK_READY_CHROME_ALPHA, 0.4);
    assert.equal(SPEAK_EMPTY_RECEIPTS, 'No receipts on this 1-pager');
    assert.equal(resolveSpeakReady(true, 'meeting'), true);
    assert.equal(resolveSpeakReady(false, 'meeting'), false);
    assert.equal(resolveSpeakReady(true, 'live'), false);
    assert.equal(resolveSpeakReady(true, 'report'), false);
  });

  it('opens the first receipt on R, ignores an open slip, and ignores typing', () => {
    assert.equal(SPEAK_RECEIPTS_KEY, 'r');
    const opened = speakReceiptShortcut(
      { key: 'r', target: { tagName: 'BODY' } },
      { speakReady: true, receiptCount: 2, openIndex: null }
    );
    assert.deepEqual(opened, { type: 'open', index: 0 });
    const alreadyOpen = speakReceiptShortcut(
      { key: 'R', target: { tagName: 'DIV' } },
      { speakReady: true, receiptCount: 2, openIndex: 0 }
    );
    assert.deepEqual(alreadyOpen, { type: 'ignore' });
    const reopened = speakReceiptShortcut(
      { key: 'r', target: { tagName: 'BODY' } },
      { speakReady: true, receiptCount: 2, openIndex: null }
    );
    assert.deepEqual(reopened, { type: 'open', index: 0 });
    assert.equal(
      speakReceiptShortcut(
        { key: 'r', target: { tagName: 'TEXTAREA' } },
        { speakReady: true, receiptCount: 2, openIndex: null }
      ).type,
      'ignore'
    );
    assert.equal(
      speakReceiptShortcut(
        { key: 'r', target: { tagName: 'INPUT' } },
        { speakReady: true, receiptCount: 1, openIndex: null }
      ).type,
      'ignore'
    );
    assert.equal(
      speakReceiptShortcut(
        { key: 'r', metaKey: true, target: { tagName: 'BODY' } },
        { speakReady: true, receiptCount: 1, openIndex: null }
      ).type,
      'ignore'
    );
    assert.equal(
      speakReceiptShortcut(
        { key: 'r', target: { tagName: 'BODY' } },
        { speakReady: false, receiptCount: 2, openIndex: null }
      ).type,
      'ignore'
    );
    assert.equal(
      speakReceiptShortcut(
        { key: 'r', target: { tagName: 'BODY' } },
        { speakReady: true, receiptCount: 0, openIndex: null }
      ).type,
      'empty'
    );
  });

  it('mounts a real toggle in AppShell, enlarges the 1-pager, and adds no /v1 route', () => {
    const shell = read('components/shell/AppShell.tsx');
    const toggle = read('components/shell/SpeakReadyToggle.tsx');
    const pager = read('components/meeting/MeetingOnePager.tsx');
    const css = read('app/globals.css');
    const http = read('src/server/http.js');
    const header = read('components/workspace/WorkspaceHeader.tsx');

    assert.match(shell, /SpeakReadyToggle/);
    assert.match(shell, /workspaceMode === 'meeting'/);
    assert.match(shell, /resolveSpeakReady/);
    assert.match(shell, /speakReceiptShortcut/);
    assert.match(shell, /setSpeakReady\(false\)/);
    assert.match(shell, /setWorkspaceMode\('live'\)/);
    assert.match(shell, /is-speak-ready/);
    assert.match(shell, /enlarged=\{speakLive\}/);
    assert.equal(shell.includes("'/v1/speak"), false);
    assert.equal(shell.includes('"/v1/speak'), false);

    assert.equal(toggle.includes('Deferred'), false);
    assert.equal(toggle.includes('epic 1.5'), false);
    assert.equal(toggle.includes('No E0'), false);
    assert.match(toggle, /aria-pressed/);
    assert.match(toggle, /aria-keyshortcuts/);
    assert.match(toggle, /shell\.speak_ready_toggle/);

    assert.match(pager, /meeting-one-pager--speak/);
    assert.match(pager, /section-body/);
    assert.match(pager, /data-speak-body/);

    assert.match(header, /workspace-header/);
    assert.match(header, /workspace\.leave_meeting/);
    assert.match(header, /Leave meeting/);

    assert.match(css, /--speak-body-size:\s*18px/);
    assert.match(css, /--speak-body-line:\s*28px/);
    assert.match(css, /--speak-chrome-opacity:\s*0\.4/);
    assert.match(css, /\.speak-ready-dim/);
    assert.match(css, /meeting-one-pager--speak/);
    assert.match(css, /color:\s*var\(--ink-muted\)/);
    assert.match(css, /opacity:\s*var\(--speak-chrome-opacity\)/);
    assert.match(read('components/shell/FirmContextBar.tsx'), /speak-ready-dim/);
    assert.match(read('components/shell/FocusChip.tsx'), /speak-ready-dim/);
    assert.match(shell, /speak-ready-dim/);
    assert.match(shell, /SPEAK_EMPTY_RECEIPTS/);
    assert.equal(read('components/meeting/SendMeetingBar.tsx').includes('speak-ready'), false);
    assert.equal(shell.includes('getUserMedia'), false);
    assert.equal(shell.includes('SpeechRecognition'), false);
    assert.match(toggle, /speak-ready-toggle/);
    assert.match(toggle, /is-on/);
    assert.match(toggle, /Speak ready — press R to open receipts/);

    assert.equal(http.includes('/v1/speak'), false);
    assert.equal(existsSync(join(root, 'middleware.ts')), false);
    assert.equal(existsSync(join(root, 'src/middleware.ts')), false);
  });
});
