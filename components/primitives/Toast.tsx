'use client';

export type ToastItem = { id: string; message: string };

export function Toast({ toasts }: { toasts: ToastItem[] }) {
  if (!toasts.length) {
    return null;
  }
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          {toast.message}
        </div>
      ))}
    </div>
  );
}
