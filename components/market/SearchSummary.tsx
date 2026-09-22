import { MarketSourceBadge } from '@/components/market/MarketSourceBadge';
import { searchRows } from '@/src/web/market-ui.js';

type SearchPayload = {
  items?: unknown;
};

export function SearchSummary({ payload }: { payload: SearchPayload }) {
  const rows = searchRows(payload);
  return (
    <article data-ui="chat.search_summary" className="market-card">
      <header className="market-card-head">
        <strong>Instruments</strong>
        <MarketSourceBadge payload={payload} />
      </header>
      {rows.length === 0 ? (
        <p className="market-card-sub">No matches</p>
      ) : (
        <ul className="market-list">
          {rows.map((row: { symbol: string; name: string | null }, index: number) => (
            <li key={`${row.symbol}-${index}`}>
              <span className="tabular">{row.symbol}</span>
              {row.name ? <span className="market-card-sub"> · {row.name}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
