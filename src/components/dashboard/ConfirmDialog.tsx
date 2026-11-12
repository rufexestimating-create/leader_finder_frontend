"use client";

import React, { useEffect, useRef } from "react";

export interface ConfirmRequest {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onClose]);

  if (!request) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog animate-fade-in-scale" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-title">{request.title}</h3>
        <div className="dialog-message">{request.message}</div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>{request.cancelLabel ?? "Cancel"}</button>
          <button
            ref={confirmRef}
            className={`btn ${request.danger ? "btn-danger-solid" : "btn-primary"}`}
            onClick={() => { onClose(); request.onConfirm(); }}
          >
            {request.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
