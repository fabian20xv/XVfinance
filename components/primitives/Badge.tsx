import type { ReactNode } from 'react';

type BadgeProps = {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'warn' | 'danger' | 'success';
  className?: string;
};

export function Badge({ children, tone = 'default', className = '' }: BadgeProps) {
  const toneClass =
    tone === 'accent'
      ? 'badge-accent'
      : tone === 'warn'
        ? 'badge-warn'
        : tone === 'danger'
          ? 'badge-danger'
          : tone === 'success'
            ? 'badge-success'
            : '';
  return <span className={`badge ${toneClass} ${className}`.trim()}>{children}</span>;
}
