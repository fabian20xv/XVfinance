export function DashedEmptySlot({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <div className="dashed-slot">
      <div>{label}</div>
      {hint ? (
        <div style={{ marginTop: 8, fontSize: 12 }}>{hint}</div>
      ) : null}
    </div>
  );
}
