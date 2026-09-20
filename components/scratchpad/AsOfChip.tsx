export function AsOfChip({ asOf }: { asOf?: string | null }) {
  return (
    <span
      className="badge"
      title="as_of from API payload only"
    >
      as of {asOf || 'unknown'}
    </span>
  );
}
