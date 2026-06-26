"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TOAST_EVENT, type AppToastDetail } from "@/lib/appToast";
import "./AppToast.css";

type ToastState = AppToastDetail & { id: number };

export default function AppToastHost() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setExiting(true);
    timerRef.current = setTimeout(() => {
      setToast(null);
      setExiting(false);
    }, 350);
  }, [clearTimer]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<AppToastDetail>).detail;
      if (!detail?.message) return;

      clearTimer();
      setExiting(false);
      idRef.current += 1;
      setToast({ ...detail, id: idRef.current });

      const duration = detail.durationMs ?? 3200;
      if (duration > 0) {
        timerRef.current = setTimeout(dismiss, duration);
      }
    };

    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      clearTimer();
    };
  }, [clearTimer, dismiss]);

  if (!toast) return null;

  return (
    <div
      key={toast.id}
      className={`app-toast app-toast--${toast.type ?? "info"}${exiting ? " app-toast--exiting" : ""}`}
      role="alert"
      onClick={dismiss}
    >
      {toast.type === "error" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ) : toast.type === "success" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )}
      <span>{toast.message}</span>
    </div>
  );
}
