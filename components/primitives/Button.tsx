import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'accent' | 'danger' | 'ghost' | 'warn';
};

export function Button({ variant = 'default', className = '', type = 'button', ...props }: ButtonProps) {
  const variantClass =
    variant === 'accent'
      ? 'btn-accent'
      : variant === 'danger'
        ? 'btn-danger'
        : variant === 'ghost'
          ? 'btn-ghost'
          : variant === 'warn'
            ? 'btn-warn'
            : '';
  return <button type={type} className={`btn ${variantClass} ${className}`.trim()} {...props} />;
}
