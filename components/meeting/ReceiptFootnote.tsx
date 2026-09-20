export function ReceiptFootnote({
  receipts,
}: {
  receipts: Array<{ citation?: string; label?: string; excerpt?: string; public_url?: null }>;
}) {
  if (!receipts.length) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)' }}>No receipts cited. public_url is always null.</p>
    );
  }
  return (
    <footer style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6 }}>Receipts · public_url: null</div>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--ink-muted)' }}>
        {receipts.map((row, index) => (
          <li key={`${row.citation ?? index}`}>
            [{row.citation ?? `R${index + 1}`}] {row.label}
            {row.excerpt ? ` — ${row.excerpt}` : ''}
          </li>
        ))}
      </ol>
    </footer>
  );
}
