import { MarketSourceBadge } from '@/components/market/MarketSourceBadge';
import { headlineRows } from '@/src/web/market-ui.js';

type NewsPayload = {
  symbol?: string | null;
  headlines?: unknown;
};

export function NewsSummary({ payload }: { payload: NewsPayload }) {
  const rows = headlineRows(payload);
  return (
    <article data-ui="chat.news_summary" data-symbol={payload.symbol ?? ''} className="market-card">
      <header className="market-card-head">
        <strong>{payload.symbol ? `${payload.symbol} headlines` : 'Headlines'}</strong>
        <MarketSourceBadge payload={payload} />
      </header>
      {rows.length === 0 ? (
        <p className="market-card-sub">No headlines</p>
      ) : (
        <ul className="market-list">
          {rows.map((row: { title: string; source: string | null }, index: number) => (
            <li key={`${row.title}-${index}`}>
              <span>{row.title}</span>
              {row.source ? <span className="market-card-sub"> · {row.source}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
