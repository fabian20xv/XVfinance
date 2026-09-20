export function DashedEmptySlot({
  label,
  hint,
  question = false,
}: {
  label: string;
  hint?: string;
  question?: boolean;
}) {
  return (
    <div className="dashed-slot">
      {question ? <span className="q">[?]</span> : null}
      <div>
        <div>{label}</div>
        {hint ? (
          <div style={{ marginTop: 8, fontSize: 12 }}>{hint}</div>
        ) : null}
      </div>
    </div>
  );
}
