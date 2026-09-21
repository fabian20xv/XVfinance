'use client';

import { DashedEmptySlot } from '@/components/workspace/DashedEmptySlot';

type Option = { id: string; label: string; client_id?: string | null };

export function FocusChip({
  clients,
  portfolios,
  clientId,
  portfolioId,
  entityLabel,
  onChange,
  onEntityClick,
}: {
  clients: Option[];
  portfolios: Option[];
  clientId?: string | null;
  portfolioId?: string | null;
  entityLabel?: string | null;
  onChange: (next: { client_id: string | null; portfolio_id: string | null }) => void;
  onEntityClick?: () => void;
}) {
  if (clients.length === 0 && !clientId) {
    return (
      <div style={{ minWidth: 220 }}>
        <DashedEmptySlot label="No client/portfolio focus" hint="list_clients returned none for this firm." />
      </div>
    );
  }
  const filteredPortfolios = clientId
    ? portfolios.filter((row) => !row.client_id || row.client_id === clientId)
    : portfolios;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {entityLabel ? (
        <button
          type="button"
          className="focus-chip"
          onClick={onEntityClick}
          title="Scroll to the focused entity in the workspace only when this chip is clicked"
        >
          {entityLabel}
        </button>
      ) : null}
      <label style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
        Client
        <select
          value={clientId ?? ''}
          onChange={(event) =>
            onChange({
              client_id: event.target.value || null,
              portfolio_id: null,
            })
          }
          style={{
            marginLeft: 6,
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: '4px 8px',
            background: 'var(--paper)',
          }}
        >
          <option value="">Select</option>
          {clients.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
        Portfolio
        <select
          value={portfolioId ?? ''}
          onChange={(event) =>
            onChange({
              client_id: clientId ?? null,
              portfolio_id: event.target.value || null,
            })
          }
          style={{
            marginLeft: 6,
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: '4px 8px',
            background: 'var(--paper)',
          }}
        >
          <option value="">Select</option>
          {filteredPortfolios.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
