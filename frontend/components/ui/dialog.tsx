"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button, type ButtonVariant } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  confirmDisabled?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/**
 * Native <dialog>: focus trap, Escape, and inert background for free.
 * Enters from 97% scale in 180ms (globals.css). Nothing is preselected.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  confirmVariant = "primary",
  confirmDisabled,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      // Capped to the viewport: header and buttons stay put, the body scrolls.
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(92vw,32rem)] flex-col overflow-hidden rounded-[14px] border border-line bg-surface p-0 text-ink shadow-[0_24px_60px_rgb(17_17_17/0.22)] open:flex"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-6 pt-5 pb-4">
        <h2 id={titleId} className="text-[18px] font-semibold leading-snug">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="pressable -mr-2 rounded-[8px] p-1.5 text-ink-3 hover:bg-surface-muted hover:text-ink"
          aria-label="Close dialog"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-5">
        {description ? (
          <div id={descId} className="text-[13px] leading-relaxed text-ink-2">
            {description}
          </div>
        ) : null}
        {children}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-line bg-canvas/60 px-6 py-3.5">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant={confirmVariant} onClick={handleConfirm} loading={busy} disabled={confirmDisabled}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
