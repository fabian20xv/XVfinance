import { FundamentalsCard } from '@/components/market/FundamentalsCard';
import { NewsSummary } from '@/components/market/NewsSummary';
import { QuoteCard } from '@/components/market/QuoteCard';
import { SearchSummary } from '@/components/market/SearchSummary';
import { isMarketTool } from '@/src/web/market-ui.js';

export function MarketResultCard({
  name,
  payload,
}: {
  name?: string;
  payload?: Record<string, unknown> | null;
}) {
  if (!name || !isMarketTool(name) || !payload) {
    return null;
  }
  if (name === 'get_quote') {
    return <QuoteCard payload={payload} />;
  }
  if (name === 'get_fundamentals') {
    return <FundamentalsCard payload={payload} />;
  }
  if (name === 'get_news_headlines') {
    return <NewsSummary payload={payload} />;
  }
  return <SearchSummary payload={payload} />;
}
