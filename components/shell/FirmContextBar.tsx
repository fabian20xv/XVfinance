'use client';

import { Badge } from '@/components/primitives/Badge';

export function FirmContextBar({
  firmId,
  role,
  userId,
}: {
  firmId?: string | null;
  role?: string | null;
  userId?: string | null;
}) {
  const tone = role === 'manager' ? 'accent' : role === 'analyst' ? 'default' : 'warn';
  return (
    <div className="speak-ready-dim" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <strong style={{ fontSize: 13 }}>XVfinance</strong>
      <span
        className="tabular"
        title={firmId ?? undefined}
        style={{ fontSize: 12, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {firmId ?? 'no firm'}
      </span>
      <Badge tone={tone}>{role === 'manager' || role === 'analyst' ? role : 'unknown role'}</Badge>
      {userId ? (
        <span className="tabular" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          {userId.slice(0, 8)}
        </span>
      ) : null}
    </div>
  );
}
