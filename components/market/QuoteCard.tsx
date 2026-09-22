import { MarketSourceBadge } from '@/components/market/MarketSourceBadge';
import { formatAsOf, formatMarketField, formatQuoteChange, formatQuoteLast } from '@/src/web/market-ui.js';

type QuotePayload = {
  symbol?: string | null;
  name?: string | null;
  last?: number | string | null;
  currency?: string | null;
  as_of?: string | null;
};

export function QuoteCard({ payload }: { payload: QuotePayload }) {
  const change = formatQuoteChange(payload as Record<string, unknown>);
  const lastLabel = formatQuoteLast(payload.last);
  return (
    <article data-ui="chat.quote_card" data-symbol={payload.symbol ?? ''} className="market-card">
      <header className="market-card-head">
        <div>
          <strong data-field="symbol">{payload.symbol || 'Quote'}</strong>
          <div className="market-card-sub" data-field="name">
            {formatMarketField(payload.name)}
          </div>
        </div>
        <MarketSourceBadge payload={payload} />
      </header>
      <div className="market-price tabular">
        <span data-field="last">{lastLabel}</span>
        <span className="market-card-sub" data-field="currency">
          {formatMarketField(payload.currency)}
        </span>
      </div>
      {change ? (
        <div className="tabular market-card-sub" data-field="change">
          {change}
        </div>
      ) : null}
      <div className="market-card-meta">as of {formatAsOf(payload.as_of)}</div>
    </article>
  );
}
