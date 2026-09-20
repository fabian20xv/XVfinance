import { formatAsOfChip } from '@/src/web/scratchpad-ui.js';

export function AsOfChip({
  asOf,
  portfolioId,
}: {
  asOf?: string | null;
  portfolioId?: string | null;
}) {
  return (
    <span className="badge" title="as_of from API payload only">
      {formatAsOfChip(asOf, portfolioId)}
    </span>
  );
}
