import { MarketSourceBadge } from '@/components/market/MarketSourceBadge';
import { formatMarketCap, formatMarketField } from '@/src/web/market-ui.js';

type FundamentalsPayload = {
  symbol?: string | null;
  name?: string | null;
  sector?: string | null;
  pe?: number | string | null;
  market_cap?: number | string | null;
  currency?: string | null;
};

export function FundamentalsCard({ payload }: { payload: FundamentalsPayload }) {
  return (
    <article data-ui="chat.fundamentals_card" data-symbol={payload.symbol ?? ''} className="market-card">
      <header className="market-card-head">
        <div>
          <strong>{payload.symbol || 'Fundamentals'}</strong>
          {payload.name ? <div className="market-card-sub">{payload.name}</div> : null}
        </div>
        <MarketSourceBadge payload={payload} />
      </header>
      <dl className="market-facts">
        <div>
          <dt>Sector</dt>
          <dd>{formatMarketField(payload.sector)}</dd>
        </div>
        <div>
          <dt>P/E</dt>
          <dd className="tabular">{formatMarketField(payload.pe)}</dd>
        </div>
        <div>
          <dt>Mkt cap</dt>
          <dd className="tabular">
            {formatMarketCap(payload.market_cap)}
            {payload.market_cap != null && payload.market_cap !== '' && payload.currency
              ? ` ${payload.currency}`
              : ''}
          </dd>
        </div>
      </dl>
    </article>
  );
}
