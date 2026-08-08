import { AlertTriangle, Check, Info, X } from "lucide-react";
import type { ToastItem } from "../hooks/useToasts";

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const toneIcon = {
  info: Info,
  success: Check,
  danger: AlertTriangle
} as const;

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-viewport" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = toneIcon[toast.tone];
        return (
          <div key={toast.id} className={`toast tone-${toast.tone}`} role="status">
            <Icon size={15} aria-hidden="true" />
            <span>{toast.message}</span>
            <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
