"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export interface Dock {
  side: "left" | "right";
  /** Distance from the bottom of the viewport, in px. */
  bottom: number;
}

const MARGIN = 16;
const DRAG_THRESHOLD = 6;

function clampBottom(bottom: number, size: number) {
  if (typeof window === "undefined") return bottom;
  return Math.min(Math.max(MARGIN, bottom), window.innerHeight - size - MARGIN);
}

/**
 * Floating button that can be dragged anywhere and snaps to the nearest side
 * on release. The spot is remembered per browser. A short press still counts
 * as a click. Keyboard: Alt+Left/Right switches side, Alt+Up/Down nudges it.
 */
export function useDraggableDock(storageKey: string, size: number) {
  const [dock, setDock] = useState<Dock | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Dock | null;
      if (saved && (saved.side === "left" || saved.side === "right") && typeof saved.bottom === "number") {
        setDock({ side: saved.side, bottom: clampBottom(saved.bottom, size) });
      }
    } catch {
      // ignore bad storage
    }
  }, [storageKey, size]);

  const save = useCallback(
    (d: Dock | null) => {
      setDock(d);
      try {
        if (d) window.localStorage.setItem(storageKey, JSON.stringify(d));
        else window.localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    },
    [storageKey],
  );

  // Keep it on screen when the window shrinks.
  useEffect(() => {
    if (!dock) return;
    const onResize = () => setDock((d) => (d ? { ...d, bottom: clampBottom(d.bottom, size) } : d));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [dock, size]);

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    start.current = { px: e.clientX, py: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      if (!s.moved && Math.hypot(e.clientX - s.px, e.clientY - s.py) < DRAG_THRESHOLD) return;
      s.moved = true;
      const x = Math.min(Math.max(MARGIN, e.clientX - s.ox), window.innerWidth - size - MARGIN);
      const y = Math.min(Math.max(MARGIN, e.clientY - s.oy), window.innerHeight - size - MARGIN);
      setDrag({ x, y });
    },
    [size],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      start.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      if (!s?.moved || !drag) {
        setDrag(null);
        return;
      }
      suppressClick.current = true;
      const side = drag.x + size / 2 < window.innerWidth / 2 ? "left" : "right";
      save({ side, bottom: clampBottom(window.innerHeight - drag.y - size, size) });
      setDrag(null);
    },
    [drag, save, size],
  );

  /** Wrap the click handler: a drag must not also open/close the panel. */
  const guardClick = useCallback((fn: () => void) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    fn();
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (!e.altKey) return;
      const cur: Dock = dock ?? { side: "right", bottom: clampBottom(window.innerHeight - e.currentTarget.getBoundingClientRect().bottom, size) };
      const step = 48;
      const next =
        e.key === "ArrowLeft" ? { ...cur, side: "left" as const }
        : e.key === "ArrowRight" ? { ...cur, side: "right" as const }
        : e.key === "ArrowUp" ? { ...cur, bottom: clampBottom(cur.bottom + step, size) }
        : e.key === "ArrowDown" ? { ...cur, bottom: clampBottom(cur.bottom - step, size) }
        : null;
      if (next) {
        e.preventDefault();
        save(next);
      }
    },
    [dock, save, size],
  );

  /** Inline position for the button; undefined means "use the default CSS spot". */
  const style = drag
    ? { left: drag.x, top: drag.y, right: "auto", bottom: "auto", transition: "none" }
    : dock
      ? { [dock.side]: MARGIN, [dock.side === "left" ? "right" : "left"]: "auto", bottom: dock.bottom, top: "auto" }
      : undefined;

  return {
    dock,
    dragging: Boolean(drag),
    style,
    reset: () => save(null),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown },
    guardClick,
  };
}
