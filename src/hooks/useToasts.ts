import { useCallback, useEffect, useRef, useState } from "react";

export type ToastTone = "info" | "success" | "danger";

export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
}

const TOAST_TIMEOUT = 4200;

/**
 * Lightweight, non-blocking notification queue. Replaces window.alert so import
 * errors, exports, and destructive actions report inline without stealing focus.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((items) => items.filter((toast) => toast.id !== id));
    const timer = timers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((items) => [...items, { id, tone, message }]);
      timers.current[id] = setTimeout(() => dismiss(id), TOAST_TIMEOUT);
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of Object.values(pending)) {
        clearTimeout(timer);
      }
    };
  }, []);

  return { toasts, push, dismiss };
}
