"use client";

import { CheckCircle2, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { toastDismissed, type Toast } from "@/store/ui-slice";

const TONE: Record<Toast["tone"], { Icon: LucideIcon; word: string; tile: string; bar: string; ms: number }> = {
  success: { Icon: CheckCircle2, word: "Done", tile: "bg-success text-canvas", bar: "bg-success", ms: 5000 },
  danger: { Icon: TriangleAlert, word: "Something went wrong", tile: "bg-danger text-canvas", bar: "bg-danger", ms: 9000 },
  info: { Icon: Info, word: "Note", tile: "bg-brand text-on-brand", bar: "bg-brand", ms: 6000 },
};

function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();
  const tone = TONE[toast.tone];
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);
  const paused = hovered || hidden;
  const remaining = useRef(tone.ms);

  useEffect(() => {
    function onVisibility() {
      setHidden(document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Count down only while visible and not hovered, so a toast is never missed.
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => dispatch(toastDismissed(toast.id)), Math.max(remaining.current, 1200));
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, dispatch, toast.id]);

  return (
    <li
      role={toast.tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="pointer-events-auto relative w-full overflow-hidden rounded-[12px] border border-line bg-surface text-ink shadow-[0_16px_40px_rgb(17_17_17/0.16)] motion-safe:animate-[ow-toast-in_220ms_var(--ease-out)]"
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-full", tone.tile)}>
          <tone.Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[11.5px] font-medium text-ink-3">{tone.word}</p>
          <p className="mt-0.5 text-[13.5px] font-medium leading-snug">{toast.title}</p>
          {toast.description ? <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{toast.description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => dispatch(toastDismissed(toast.id))}
          className="pressable -mr-1 -mt-0.5 rounded-[3px] p-1.5 text-ink-3 hover:bg-surface-muted hover:text-ink"
          aria-label="Dismiss notification"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <span
        aria-hidden
        className={cn("ow-toast-bar absolute inset-x-0 bottom-0 h-[3px] origin-left", tone.bar)}
        style={{ animation: `ow-toast-timer ${tone.ms}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }}
      />
    </li>
  );
}

/** Global notification region driven by the `ui` slice. Top-right, below the top bar. */
export function Toaster() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  return (
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed top-16 right-4 z-[60] w-[min(92vw,23rem)] lg:right-6 print:hidden">
      <ul className="flex flex-col gap-2.5">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </ul>
    </div>
  );
}
