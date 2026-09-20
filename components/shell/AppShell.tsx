'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ChatThread, type ChatMessage } from '@/components/chat/ChatThread';
import type { ConfirmCardModel } from '@/components/chat/ConfirmCard';
import { MeetingOnePager } from '@/components/meeting/MeetingOnePager';
import { ReceiptSideSlip, type ReceiptsPanel } from '@/components/meeting/ReceiptSideSlip';
import { SendMeetingBar } from '@/components/meeting/SendMeetingBar';
import { Button } from '@/components/primitives/Button';
import { Modal } from '@/components/primitives/Modal';
import { Toast, type ToastItem } from '@/components/primitives/Toast';
import { DraftVeil } from '@/components/scratchpad/DraftVeil';
import { FirmContextBar } from '@/components/shell/FirmContextBar';
import { FocusChip } from '@/components/shell/FocusChip';
import { SpeakReadyToggle } from '@/components/shell/SpeakReadyToggle';
import { DiffConfirmPanel, type DiffPanelModel } from '@/components/workspace/DiffConfirmPanel';
import { EmptyWorkspace } from '@/components/workspace/EmptyWorkspace';
import { HoldingsTable, type CashStrip, type HoldingRow } from '@/components/workspace/HoldingsTable';
import { ReportDraftView, type ReportDraft } from '@/components/workspace/ReportDraftView';
import { WorkspaceHeader } from '@/components/workspace/WorkspaceHeader';
import { callTool, v1Fetch } from '@/lib/api';
import { MOTION, SPLIT } from '@/src/web/tokens.js';
import { assertSharedProposalId } from '@/src/web/dual-confirm.js';
import { parseComposerInput } from '@/src/web/parse-composer.js';
import { discardedScratchpadState, SCRATCHPAD_WATERMARK } from '@/src/web/scratchpad-ui.js';
import { clampChatPct, resetChatPct } from '@/src/web/split.js';

type SessionPayload = { user_id: string; firm_id: string; role: 'manager' | 'analyst' };
type Option = { id: string; label: string; client_id?: string | null };
type MeetingReport = {
  id: string;
  title?: string;
  body?: string;
  sections?: Array<{ heading?: string; body?: string }>;
  status?: string;
  public_url?: null;
  receipts?: ReceiptsPanel['receipts'];
  receipts_panel?: ReceiptsPanel;
};

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random()}`;
}

function roleCanConfirm(role: string | undefined, requiresRole: string | undefined) {
  if (requiresRole === 'manager') {
    return role === 'manager';
  }
  return role === 'manager' || role === 'analyst';
}

export function AppShell({
  authSession,
  onSignOut,
}: {
  authSession: Session;
  onSignOut: () => void;
}) {
  const token = authSession.access_token;
  const [apiSession, setApiSession] = useState<SessionPayload | null>(null);
  const [chatPct, setChatPct] = useState(SPLIT.defaultChatPct);
  const [speakReady, setSpeakReady] = useState(false);
  const [composer, setComposer] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [clients, setClients] = useState<Option[]>([]);
  const [portfolios, setPortfolios] = useState<Option[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<HoldingRow[] | null>(null);
  const [cash, setCash] = useState<CashStrip | null>(null);
  const [report, setReport] = useState<ReportDraft | null>(null);
  const [meeting, setMeeting] = useState<MeetingReport | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<'live' | 'meeting' | 'report'>('live');
  const [pendingCard, setPendingCard] = useState<ConfirmCardModel | null>(null);
  const [pendingPanel, setPendingPanel] = useState<DiffPanelModel | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modal, setModal] = useState<{ title: string; body: string } | null>(null);
  const [scratchpad, setScratchpad] = useState(() => discardedScratchpadState());
  const [impact, setImpact] = useState<Record<string, unknown> | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const drag = useRef<{ startX: number; startPct: number } | null>(null);

  const firmId = apiSession?.firm_id ?? null;

  const toast = useCallback((message: string) => {
    const id = newId();
    setToasts((list) => [...list, { id, message }]);
    setTimeout(() => setToasts((list) => list.filter((row) => row.id !== id)), 4000);
  }, []);

  const pulseHighlight = useCallback((proposalId: string) => {
    setHighlightId(proposalId);
    if (highlightTimer.current) {
      clearTimeout(highlightTimer.current);
    }
    highlightTimer.current = setTimeout(() => setHighlightId(null), MOTION.crossHighlightMs);
  }, []);

  const attachProposal = useCallback(
    (data: Record<string, unknown> | undefined) => {
      if (!data) {
        return;
      }
      const card = (data.confirm_card ?? (data.ui === 'chat.confirm_card' ? data : null)) as ConfirmCardModel | null;
      const panel = (data.workspace_panel ??
        (data.ui === 'workspace.diff_confirm_panel' ? data : null)) as DiffPanelModel | null;
      if (card?.proposal_id && panel?.proposal_id) {
        try {
          assertSharedProposalId(card, panel);
        } catch (err) {
          toast((err as Error).message);
          return;
        }
        setPendingCard(card);
        setPendingPanel(panel);
        pulseHighlight(card.proposal_id);
      } else if (card?.proposal_id) {
        setPendingCard(card);
      } else if (panel?.proposal_id) {
        setPendingPanel(panel);
      }
    },
    [pulseHighlight, toast]
  );

  const runTool = useCallback(
    async (name: string, args: Record<string, unknown> = {}, fid: string | null = firmId) => {
      return callTool(token, fid, name, args);
    },
    [token, firmId]
  );

  const loadFocusData = useCallback(
    async (
      focus: { client_id?: string | null; portfolio_id?: string | null },
      fid: string | null = firmId
    ) => {
      setClientId(focus.client_id ?? null);
      setPortfolioId(focus.portfolio_id ?? null);
      if (focus.portfolio_id) {
        const [portfolio, listed] = await Promise.all([
          runTool<{ cash_balance?: number; cash_currency?: string; liquidity_available?: number; liquidity_buffer?: number; name?: string }>(
            'get_portfolio',
            { portfolio_id: focus.portfolio_id },
            fid
          ),
          runTool<{ items?: HoldingRow[] }>(
            'list_holdings',
            { portfolio_id: focus.portfolio_id, limit: 100, offset: 0 },
            fid
          ),
        ]);
        setCash(portfolio.ok && portfolio.data ? portfolio.data : null);
        setHoldings(listed.ok ? listed.data?.items ?? [] : []);
        setAsOf(new Date().toISOString().slice(0, 10));
      } else {
        setHoldings(null);
        setCash(null);
      }
    },
    [firmId, runTool]
  );

  const bootstrap = useCallback(async () => {
    const sessionRes = await v1Fetch<SessionPayload>('/v1/session', { token });
    if (!sessionRes.ok || !sessionRes.data) {
      toast(sessionRes.error?.message ?? 'GET /v1/session failed');
      return;
    }
    setApiSession(sessionRes.data);
    const fid = sessionRes.data.firm_id;
    const [context, clientList, portfolioList, pending] = await Promise.all([
      callTool<{ focus?: { client_id?: string | null; portfolio_id?: string | null } }>(
        token,
        fid,
        'get_session_context',
        {}
      ),
      callTool<{ items?: Option[] }>(token, fid, 'list_clients', { limit: 50, offset: 0 }),
      callTool<{ items?: Array<Option & { client_id?: string }> }>(token, fid, 'list_portfolios', {
        limit: 50,
        offset: 0,
      }),
      v1Fetch<{ items?: Array<Record<string, unknown>> }>('/v1/proposals?status=pending&limit=5', {
        token,
        firmId: fid,
      }),
    ]);
    setClients(clientList.ok ? clientList.data?.items ?? [] : []);
    setPortfolios(portfolioList.ok ? portfolioList.data?.items ?? [] : []);
    const focus = context.ok ? context.data?.focus : null;
    await loadFocusData(
      {
        client_id: focus?.client_id ?? null,
        portfolio_id: focus?.portfolio_id ?? null,
      },
      fid
    );
    const first = pending.ok ? pending.data?.items?.[0] : null;
    if (first) {
      attachProposal(first);
    }
  }, [attachProposal, loadFocusData, toast, token]);

  useEffect(() => {
    void bootstrap();
    // Re-run when the JWT changes; avoid looping on firmId state.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap identity tracks firmId
  }, [token]);

  const onFocusChange = async (next: { client_id: string | null; portfolio_id: string | null }) => {
    const result = await runTool('set_workspace_focus', {
      ...(next.client_id ? { client_id: next.client_id } : {}),
      ...(next.portfolio_id ? { portfolio_id: next.portfolio_id } : {}),
    });
    if (!result.ok) {
      toast(result.error?.message ?? 'set_workspace_focus failed');
      return;
    }
    await loadFocusData(next);
  };

  const pushMessage = (message: ChatMessage) => setMessages((list) => [...list, message]);

  const onSubmitComposer = async () => {
    const parsed = parseComposerInput(composer);
    if (parsed.type === 'empty') {
      return;
    }
    const text = composer;
    setComposer('');
    pushMessage({ id: newId(), role: 'user', text });
    if (parsed.type === 'invalid_json') {
      pushMessage({ id: newId(), role: 'assistant', text: parsed.message });
      return;
    }
    if (parsed.type === 'message') {
      pushMessage({
        id: newId(),
        role: 'assistant',
        text: 'No model chat endpoint in E0–E9. Dispatch an allowlisted tool with /tool_name {json} or {"name","args"}.',
      });
      return;
    }
    const runningId = newId();
    pushMessage({
      id: runningId,
      role: 'tool',
      text: `POST /v1/tools ${parsed.name}`,
      toolName: parsed.name,
      toolStatus: 'running',
    });
    setBusy(true);
    const result = await runTool(parsed.name, parsed.args);
    setBusy(false);
    const data = result.data as Record<string, unknown> | undefined;
    attachProposal(data);
    const pending = Boolean(
      data &&
        ((data.confirm_card as ConfirmCardModel | undefined)?.status === 'pending' ||
          data.status === 'pending' ||
          (data.ui === 'chat.confirm_card' && data.status === 'pending'))
    );
    setMessages((list) =>
      list.map((row) =>
        row.id === runningId
          ? {
              ...row,
              toolStatus: result.ok ? (pending ? 'pending_confirm' : 'ok') : 'error',
              text: result.ok
                ? JSON.stringify(result.data, null, 2)
                : result.error?.message ?? 'Tool failed',
              confirmCard:
                (data?.confirm_card as ConfirmCardModel | undefined) ??
                (data?.ui === 'chat.confirm_card' ? (data as ConfirmCardModel) : undefined),
            }
          : row
      )
    );
    if (parsed.name === 'get_meeting_one_pager' && result.ok && data) {
      setMeeting(data as MeetingReport);
      setWorkspaceMode('meeting');
    }
    if (parsed.name === 'get_report' && result.ok && data) {
      setReport(data as ReportDraft);
      setWorkspaceMode('report');
    }
  };

  const actOnProposal = async (proposalId: string, path: string, method: string) => {
    const requires = pendingCard?.requires_role ?? pendingPanel?.requires_role;
    if (method === 'POST' && path.endsWith('/confirm') && !roleCanConfirm(apiSession?.role, requires)) {
      setModal({
        title: 'Manager confirm required',
        body: `This proposal requires ${requires}. Your role is ${apiSession?.role ?? 'unknown'}.`,
      });
      return;
    }
    setBusy(true);
    const result = await v1Fetch(path, { token, firmId, method });
    setBusy(false);
    if (!result.ok) {
      toast(result.error?.message ?? 'Proposal action failed');
      return;
    }
    attachProposal(result.data as Record<string, unknown>);
    toast(`${method} ${path}`);
    if (portfolioId) {
      await loadFocusData({ client_id: clientId, portfolio_id: portfolioId });
    }
  };

  const enterScratchpad = async () => {
    if (!portfolioId) {
      toast('Select a portfolio before opening the scratchpad veil.');
      return;
    }
    setBusy(true);
    const created = await runTool<{ id?: string; watermark?: string; updated_at?: string }>(
      'create_scratchpad',
      {
        portfolio_id: portfolioId,
        name: `scratch-${Date.now()}`,
        scenario: {
          holdings: (holdings ?? []).map((row) => ({
            instrument_id: row.instrument_id,
            symbol: row.label,
            quantity: row.quantity,
          })),
        },
      }
    );
    if (!created.ok || !created.data?.id) {
      setBusy(false);
      toast(created.error?.message ?? 'create_scratchpad failed');
      return;
    }
    const impactRes = await v1Fetch<Record<string, unknown>>(`/v1/scratchpads/${created.data.id}/impact`, {
      token,
      firmId,
    });
    setBusy(false);
    setScratchpad({
      open: true,
      dissolving: false,
      id: created.data.id,
      overlay: created.data,
      persisted: false,
      source_of_truth: false,
      live: false,
    });
    setImpact(impactRes.ok ? (impactRes.data ?? null) : null);
  };

  const discardScratchpad = () => {
    setScratchpad((prev) => ({ ...prev, dissolving: true, open: true }));
    setTimeout(() => {
      setScratchpad(discardedScratchpadState());
      setImpact(null);
    }, MOTION.scratchpadDissolveMs);
  };

  const promoteScratchpad = async () => {
    if (!scratchpad.id) {
      toast('Scratchpad has no id — nothing to promote.');
      return;
    }
    if (apiSession?.role !== 'manager') {
      setModal({
        title: 'Manager dual-confirm',
        body: 'scratchpad_promote requires manager confirm on ConfirmCard and DiffConfirmPanel.',
      });
    }
    setBusy(true);
    const result = await runTool('promote_scratchpad', { scratchpad_id: scratchpad.id });
    setBusy(false);
    if (!result.ok) {
      toast(result.error?.message ?? 'promote_scratchpad failed');
      return;
    }
    attachProposal(result.data as Record<string, unknown>);
    toast('scratchpad_promote opened — dual-confirm on the same proposal_id');
  };

  const loadMeeting = async () => {
    if (!clientId) {
      toast('Select a client before ghostwriting a meeting 1-pager.');
      return;
    }
    setBusy(true);
    const result = await runTool<MeetingReport>('ghostwrite_meeting_one_pager', {
      client_id: clientId,
      ...(portfolioId ? { portfolio_id: portfolioId } : {}),
    });
    setBusy(false);
    if (!result.ok || !result.data) {
      toast(result.error?.message ?? 'ghostwrite_meeting_one_pager failed');
      return;
    }
    setMeeting(result.data);
    setWorkspaceMode('meeting');
  };

  const sendMeeting = async (channel: 'email' | 'export') => {
    if (!meeting?.id) {
      toast('No meeting 1-pager to send.');
      return;
    }
    setBusy(true);
    const result = await runTool('propose_meeting_send', { report_id: meeting.id, channel });
    setBusy(false);
    if (!result.ok) {
      toast(result.error?.message ?? 'propose_meeting_send failed');
      return;
    }
    attachProposal(result.data as Record<string, unknown>);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag.current) {
      return;
    }
    const delta = ((event.clientX - drag.current.startX) / window.innerWidth) * 100;
    setChatPct(clampChatPct(drag.current.startPct + delta));
  };
  const onPointerUp = () => {
    drag.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  const canConfirm = roleCanConfirm(
    apiSession?.role,
    pendingCard?.requires_role ?? pendingPanel?.requires_role
  );

  const workspaceTitle = useMemo(() => {
    if (workspaceMode === 'meeting') {
      return 'Meeting 1-pager';
    }
    if (workspaceMode === 'report') {
      return 'Report draft';
    }
    const label = portfolios.find((row) => row.id === portfolioId)?.label;
    return label ?? 'Workspace';
  }, [workspaceMode, portfolios, portfolioId]);

  const receiptsPanel = meeting?.receipts_panel ?? (meeting ? { ui: 'workspace.receipts_panel', receipts: meeting.receipts, public_url: null, report_id: meeting.id } : null);

  return (
    <div className="app-root" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="top-bar">
        <FirmContextBar firmId={apiSession?.firm_id} role={apiSession?.role} userId={apiSession?.user_id} />
        <FocusChip
          clients={clients}
          portfolios={portfolios}
          clientId={clientId}
          portfolioId={portfolioId}
          onChange={(next) => void onFocusChange(next)}
        />
        <span style={{ flex: 1 }} />
        <SpeakReadyToggle ready={speakReady} onChange={setSpeakReady} />
        <Button variant="ghost" onClick={() => setChatPct(resetChatPct())}>
          Reset 56/44
        </Button>
        <Button variant="ghost" onClick={onSignOut}>
          Sign out
        </Button>
      </header>
      <div className="shell-panes" style={{ ['--chat-pct' as string]: `${chatPct}%` }}>
        <ChatThread
          messages={messages}
          composer={composer}
          onComposerChange={setComposer}
          onSubmit={() => void onSubmitComposer()}
          pendingConfirm={pendingCard?.status === 'pending'}
          busy={busy}
          highlightedProposalId={highlightId}
          canConfirm={canConfirm}
          onHoverProposal={pulseHighlight}
          onConfirm={(id, path, method) => void actOnProposal(id, path, method)}
          onReject={(id, path, method) => void actOnProposal(id, path, method)}
        />
        <button
          type="button"
          className="split-handle"
          aria-label="Resize chat pane"
          onPointerDown={(event) => {
            drag.current = { startX: event.clientX, startPct: chatPct };
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
          }}
          onDoubleClick={() => setChatPct(resetChatPct())}
        />
        <section className="pane" aria-label="Workspace" style={{ position: 'relative' }}>
          <WorkspaceHeader
            title={workspaceTitle}
            asOf={asOf}
            scratchpadOpen={scratchpad.open}
            onEnterScratchpad={() => void enterScratchpad()}
            onShowMeeting={() => void loadMeeting()}
          />
          <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'grid', gap: 16 }}>
            {pendingPanel ? (
              <DiffConfirmPanel
                panel={pendingPanel}
                highlighted={highlightId === pendingPanel.proposal_id}
                canConfirm={canConfirm}
                busy={busy}
                onHover={pulseHighlight}
                onConfirm={(id, path, method) => void actOnProposal(id, path, method)}
                onReject={(id, path, method) => void actOnProposal(id, path, method)}
              />
            ) : null}
            {workspaceMode === 'meeting' ? (
              <>
                <MeetingOnePager report={meeting} />
                <ReceiptSideSlip panel={receiptsPanel} />
                <SendMeetingBar disabled={!meeting} busy={busy} onSend={(channel) => void sendMeeting(channel)} />
              </>
            ) : workspaceMode === 'report' ? (
              <ReportDraftView report={report} />
            ) : portfolioId ? (
              <HoldingsTable holdings={holdings} cash={cash} />
            ) : (
              <EmptyWorkspace />
            )}
          </div>
          <DraftVeil
            open={scratchpad.open}
            dissolving={scratchpad.dissolving}
            watermark={SCRATCHPAD_WATERMARK}
            asOf={asOf}
            impact={
              impact && typeof impact === 'object' && 'impact' in impact
                ? (impact.impact as never)
                : (impact as never)
            }
            busy={busy}
            canPromote={Boolean(scratchpad.id)}
            onDiscard={discardScratchpad}
            onPromote={() => void promoteScratchpad()}
          />
        </section>
      </div>
      <Toast toasts={toasts} />
      <Modal open={Boolean(modal)} title={modal?.title ?? ''} onClose={() => setModal(null)}>
        {modal?.body}
      </Modal>
    </div>
  );
}
