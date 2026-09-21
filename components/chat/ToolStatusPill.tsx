import { Badge } from '@/components/primitives/Badge';

export function ToolStatusPill({
  status,
  name,
}: {
  status: 'running' | 'ok' | 'error' | 'pending_confirm';
  name?: string;
}) {
  const tone =
    status === 'error' ? 'danger' : status === 'ok' ? 'success' : status === 'pending_confirm' ? 'warn' : 'accent';
  const label =
    status === 'running'
      ? 'running'
      : status === 'ok'
        ? 'ok'
        : status === 'error'
          ? 'error'
          : 'pending confirm';
  return (
    <Badge tone={tone}>
      {name ? `${name} · ${label}` : label}
    </Badge>
  );
}
