export function AmberPulseNumber({
  value,
  pulse = true,
}: {
  value: string | number;
  pulse?: boolean;
}) {
  return <span className={pulse ? 'amber-pulse' : 'tabular'}>{value}</span>;
}
