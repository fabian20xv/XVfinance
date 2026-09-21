'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ChatThread, type ChatMessage } from '@/components/chat/ChatThread';
import type { ConfirmOutcome } from '@/components/chat/ConfirmActions';
import type { ConfirmCardModel } from '@/components/chat/ConfirmCard';
import { MeetingOnePager } from '@/components/meeting/MeetingOnePager';
import type { ReceiptsPanel } from '@/components/meeting/ReceiptSideSlip';
import { SendMeetingBar } from '@/components/meeting/SendMeetingBar';
import { Button } from '@/components/primitives/Button';
import { Modal } from '@/components/primitives/Modal';
import { Toast, type ToastItem } from '@/components/primitives/Toast';
import { DraftVeil } from '@/components/scratchpad/DraftVeil';
import { FirmContextBar } from '@/components/shell/FirmContextBar';
import { FocusChip } from '@/components/shell/FocusChip';
import { DiffConfirmPanel, type DiffPanelModel } from '@/components/workspace/DiffConfirmPanel';
import { EmptyWorkspace } from '@/components/workspace/EmptyWorkspace';
import { HoldingsTable, type CashStrip, type HoldingRow } from '@/components/workspace/HoldingsTable';
import { ReportDraftView, type ReportDraft } from '@/components/workspace/ReportDraftView';
import { WorkspaceHeader } from '@/components/workspace/WorkspaceHeader';
import { callTool, streamChatTurn, v1Fetch } from '@/lib/api';
import { actionPath, assertSharedProposalId } from '@/src/web/dual-confirm.js';
import { MOTION, SPLIT } from '@/src/web/tokens.js';
import { parseComposerInput } from '@/src/web/parse-composer.js';
import { discardedScratchpadState, SCRATCHPAD_FAIL_TOAST } from '@/src/web/scratchpad-ui.js';
import { clampChatPct, resetChatPct } from '@/src/web/split.js';
import { scrollDiffPanelIfClipped } from '@/src/web/confirm-ui.js';
import { focusEntityLabel } from '@/src/web/receipt-ui.js';

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
  const [meetingMissing, setMeetingMissing] = useState(false);
  const [pendingCard, setPendingCard] = useState<ConfirmCardModel | null>(null);
  const [pendingPanel, setPendingPanel] = useState<DiffPanelModel | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmOutcome, setConfirmOutcome] = useState<ConfirmOutcome>(null);
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
    const panel = document.querySelector('[data-ui="workspace.diff_confirm_panel"]');
    const scrollParent = panel?.parentElement ?? null;
    scrollDiffPanelIfClipped(panel, scrollParent);
    const twin = document.querySelector(
      `[data-ui="chat.confirm_card"][data-proposal-id="${proposalId}"]`
    ) as HTMLElement | null;
    twin?.setAttribute('data-pulse-twin', 'true');
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
        setAsOf(new Date().toISOString());
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
    const history = messages
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map((row) => ({ role: row.role, content: row.text }))
      .concat({ role: 'user', content: text.trim() });
    const assistantId = newId();
    pushMessage({ id: assistantId, role: 'assistant', text: '' });
    setBusy(true);
    let assembled = '';
    const result = await streamChatTurn(token, firmId, history, {
      onDelta: (chunk) => {
        assembled += chunk;
        setMessages((list) =>
          list.map((row) => (row.id === assistantId ? { ...row, text: assembled } : row))
        );
      },
      onTool: (event) => {
        if (!event.name) {
          return;
        }
        setMessages((list) => {
          const existing = list.find((row) => row.toolName === event.name && row.role === 'tool' && row.toolStatus === 'running');
          if (event.status === 'running' && !existing) {
            return [
              ...list,
              {
                id: newId(),
                role: 'tool' as const,
                text: `tool ${event.name}`,
                toolName: event.name,
                toolStatus: 'running',
              },
            ];
          }
          return list.map((row) =>
            row.role === 'tool' && row.toolName === event.name && (row.toolStatus === 'running' || row.id === existing?.id)
              ? {
                  ...row,
                  toolStatus: event.status ?? row.toolStatus,
                  text: event.error?.message ?? row.text,
                }
              : row
          );
        });
      },
    });
    setBusy(false);
    if (!result.ok) {
      const message = result.error?.message ?? 'Chat turn failed.';
      setMessages((list) =>
        list.map((row) => (row.id === assistantId ? { ...row, text: assembled || message } : row))
      );
      toast(message);
      return;
    }
    const data = {
      ...(typeof result.confirm_card === 'object' && result.confirm_card ? { confirm_card: result.confirm_card } : {}),
      ...(typeof result.workspace_panel === 'object' && result.workspace_panel
        ? { workspace_panel: result.workspace_panel }
        : {}),
    } as Record<string, unknown>;
    attachProposal(data);
    const pending = Boolean(
      result.confirm_card &&
        typeof result.confirm_card === 'object' &&
        (result.confirm_card as ConfirmCardModel).status === 'pending'
    );
    setMessages((list) =>
      list.map((row) =>
        row.id === assistantId
          ? {
              ...row,
              text: result.text || assembled || row.text,
              confirmCard: (result.confirm_card as ConfirmCardModel | undefined) ?? undefined,
              toolStatus: pending ? 'pending_confirm' : undefined,
            }
          : row
      )
    );
    const meeting = result.artifacts?.meeting as MeetingReport | undefined;
    if (meeting) {
      setMeetingMissing(false);
      setMeeting(meeting);
      setWorkspaceMode('meeting');
    }
    const report = result.artifacts?.report as ReportDraft | undefined;
    if (report) {
      setReport(report);
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
    const confirming = path.endsWith('/confirm');
    if (!result.ok) {
      toast(scratchpad.open ? SCRATCHPAD_FAIL_TOAST : (result.error?.message ?? 'Proposal action failed'));
      return;
    }
    if (confirming) {
      const at = new Date();
      setConfirmOutcome({ status: 'confirmed', at, proposalId });
      if (scratchpad.open) {
        setScratchpad((prev) => ({ ...prev, success: true, dissolving: true, open: true }));
        setTimeout(() => {
          setScratchpad(discardedScratchpadState());
          setImpact(null);
        }, MOTION.scratchpadDissolveMs);
      }
      if (successTimer.current) {
        clearTimeout(successTimer.current);
      }
      successTimer.current = setTimeout(() => {
        setPendingCard(null);
        setPendingPanel(null);
        setConfirmOutcome(null);
      }, MOTION.successFadeMs);
    } else {
      setPendingCard(null);
      setPendingPanel(null);
      setConfirmOutcome(null);
    }
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
      success: false,
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
      toast(scratchpad.open ? SCRATCHPAD_FAIL_TOAST : (result.error?.message ?? 'promote_scratchpad failed'));
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
      setMeeting(null);
      setMeetingMissing(true);
      setWorkspaceMode('meeting');
      toast(result.error?.message ?? 'ghostwrite_meeting_one_pager failed');
      return;
    }
    setMeetingMissing(false);
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

  const impactPayload =
    impact && typeof impact === 'object' && 'impact' in impact
      ? (impact.impact as { changed?: Array<{ symbol?: string }> })
      : (impact as { changed?: Array<{ symbol?: string }> } | null);
  const entityLabel = focusEntityLabel(
    impactPayload?.changed?.[0]?.symbol ?? holdings?.[0]?.label,
    'impact'
  );
  const pulseSymbols = (impactPayload?.changed ?? [])
    .map((row) => row.symbol)
    .filter((symbol): symbol is string => Boolean(symbol));
  const pulseCash = pulseSymbols.some((symbol) => symbol.toLowerCase() === 'cash');

  const runPendingAction = (action: 'confirm' | 'reject') => {
    const id = pendingCard?.proposal_id ?? pendingPanel?.proposal_id;
    const hit = actionPath(pendingCard?.actions ?? pendingPanel?.actions, action);
    if (id && hit) {
      void actOnProposal(id, hit.path, hit.method);
    }
  };

  const diffPanel = pendingPanel ? (
    <DiffConfirmPanel
      panel={pendingPanel}
      highlighted={highlightId === pendingPanel.proposal_id}
      canConfirm={canConfirm}
      busy={busy}
      outcome={confirmOutcome}
      onSelect={pulseHighlight}
      onConfirm={(id, path, method) => void actOnProposal(id, path, method)}
      onReject={(id, path, method) => void actOnProposal(id, path, method)}
    />
  ) : null;

  return (
    <div className="app-root" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="top-bar">
        <FirmContextBar firmId={apiSession?.firm_id} role={apiSession?.role} userId={apiSession?.user_id} />
        <FocusChip
          clients={clients}
          portfolios={portfolios}
          clientId={clientId}
          portfolioId={portfolioId}
          entityLabel={entityLabel}
          onChange={(next) => void onFocusChange(next)}
          onEntityClick={() => {
            document.querySelector('[data-meeting-one-pager="true"]')?.scrollIntoView({
              block: 'nearest',
              behavior: 'smooth',
            });
          }}
        />
        <span style={{ flex: 1 }} />
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
          hideConfirmCard={scratchpad.open}
          pendingCard={pendingCard}
          outcome={confirmOutcome}
          onSelectProposal={pulseHighlight}
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
            {!scratchpad.open ? diffPanel : null}
            {workspaceMode === 'meeting' ? (
              <>
                <MeetingOnePager report={meeting} missing={meetingMissing} />
                <SendMeetingBar disabled={!meeting} busy={busy} onSend={(channel) => void sendMeeting(channel)} />
              </>
            ) : workspaceMode === 'report' ? (
              <ReportDraftView report={report} />
            ) : portfolioId ? (
              <HoldingsTable
                holdings={holdings}
                cash={cash}
                pulseSymbols={scratchpad.open ? pulseSymbols : []}
                pulseCash={scratchpad.open && pulseCash}
              />
            ) : (
              <EmptyWorkspace />
            )}
          </div>
          <DraftVeil
            open={scratchpad.open}
            dissolving={scratchpad.dissolving}
            success={scratchpad.success}
            confirmed={confirmOutcome?.status === 'confirmed'}
            asOf={asOf}
            portfolioId={portfolioId}
            impact={impactPayload as never}
            busy={busy}
            canPromote={Boolean(scratchpad.id)}
            pendingConfirm={Boolean(scratchpad.open && pendingPanel?.status === 'pending')}
            panel={scratchpad.open ? diffPanel : null}
            onDiscard={discardScratchpad}
            onPromote={() => void promoteScratchpad()}
            onConfirmChange={() => runPendingAction('confirm')}
            onDismissProposal={() => runPendingAction('reject')}
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
