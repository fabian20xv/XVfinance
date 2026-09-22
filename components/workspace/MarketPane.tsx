import { MarketResultCard } from '@/components/market/MarketResultCard';
import { MarketSourceBadge } from '@/components/market/MarketSourceBadge';
import { isStubMarket, marketWorkspaceHasContent } from '@/src/web/market-ui.js';

export type MarketWorkspaceModel = {
  quote?: Record<string, unknown> | null;
  fundamentals?: Record<string, unknown> | null;
  news?: Record<string, unknown> | null;
  search?: Record<string, unknown> | null;
};

const SECTIONS = [
  ['quote', 'get_quote'],
  ['fundamentals', 'get_fundamentals'],
  ['news', 'get_news_headlines'],
  ['search', 'search_instruments'],
] as const;

export function MarketPane({ workspace }: { workspace: MarketWorkspaceModel | null }) {
  if (!marketWorkspaceHasContent(workspace)) {
    return null;
  }
  const panes = SECTIONS.flatMap(([slot, name]) => {
    const payload = workspace?.[slot];
    return payload ? [{ slot, name, payload }] : [];
  });
  const stub = panes.some((row) => isStubMarket(row.payload));
  const badgePayload = stub ? { stub: true } : { stub: false, provider: 'http' };
  return (
    <div
      data-ui="workspace.market_pane"
      data-blank="false"
      data-stub={stub ? 'true' : 'false'}
      className="market-pane"
    >
      <div className="market-card-head">
        <strong>Market</strong>
        <MarketSourceBadge payload={badgePayload} />
      </div>
      {panes.map((row) => (
        <MarketResultCard key={row.slot} name={row.name} payload={row.payload} />
      ))}
    </div>
  );
}
