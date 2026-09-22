import { Badge } from '@/components/primitives/Badge';
import { isStubMarket } from '@/src/web/market-ui.js';

export function MarketSourceBadge({ payload }: { payload: unknown }) {
  if (isStubMarket(payload)) {
    return (
      <Badge tone="warn" className="market-stub-badge">
        Stub / sample data
      </Badge>
    );
  }
  return <span className="market-live-badge">Live</span>;
}
