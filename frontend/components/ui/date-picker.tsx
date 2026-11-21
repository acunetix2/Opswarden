"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";

import { Dropdown } from "./dropdown";

/*
 * Values are plain strings so they round-trip through forms and the API unchanged:
 *   date mode      "YYYY-MM-DD"
 *   datetime mode  "YYYY-MM-DDTHH:mm" (local time)
 */

interface DatePickerProps {
  id?: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  /** Also pick a time of day. */
  withTime?: boolean;
  /** Minute step for the time list (default 5). */
  minuteStep?: number;
  min?: string | null;
  max?: string | null;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  /** 0 = Sunday, 1 = Monday (default). */
  weekStartsOn?: 0 | 1;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parseKey(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseTime(s: string | null | undefined): { h: number; m: number } | null {
  const t = /T(\d{2}):(\d{2})/.exec(s ?? "");
  return t ? { h: Number(t[1]), m: Number(t[2]) } : null;
}

const sameDay = (a: Date | null, b: Date | null) => Boolean(a && b && toKey(a) === toKey(b));
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
};

/**
 * Calendar date (and optional time) picker.
 * Keyboard: arrows move by day/week, PageUp/PageDown by month (Shift for year),
 * Home/End to the start/end of the week, Enter selects, Escape closes.
 */
export function DatePicker({
  id,
  value,
  onChange,
  withTime = false,
  minuteStep = 5,
  min,
  max,
  placeholder,
  disabled,
  clearable = true,
  weekStartsOn = 1,
  className,
  ...aria
}: DatePickerProps) {
  const autoId = useId();
  const triggerId = id ?? autoId;
  const panelId = `${triggerId}-calendar`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const selected = parseKey(value);
  const time = parseTime(value) ?? { h: 9, m: 0 };
  const minD = parseKey(min);
  const maxD = parseKey(max);
  const today = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months">("days");
  const [focus, setFocus] = useState<Date>(selected ?? today);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const locale = typeof navigator !== "undefined" ? navigator.language : "en-GB";
  const fmtTrigger = useMemo(
    () => new Intl.DateTimeFormat(locale, withTime ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" }),
    [locale, withTime],
  );
  const fmtMonth = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }), [locale]);
  const fmtLong = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), [locale]);
  const monthNames = useMemo(() => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(2026, i, 1))), [locale]);
  const weekdays = useMemo(() => {
    const base = new Date(2026, 0, 4 + weekStartsOn); // 4 Jan 2026 is a Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      return { short: new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(d), long: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(d) };
    });
  }, [locale, weekStartsOn]);

  const outOfRange = useCallback((d: Date) => Boolean((minD && d < minD) || (maxD && d > maxD)), [minD, maxD]);

  const days = useMemo(() => {
    const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
    const offset = (first.getDay() - weekStartsOn + 7) % 7;
    const start = addDays(first, -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [focus, weekStartsOn]);

  // ---- open / close ------------------------------------------------------------------

  const place = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    const p = panelRef.current;
    if (!t || !p) return;
    const w = p.offsetWidth || 300;
    const h = p.offsetHeight || 360;
    const below = window.innerHeight - t.bottom;
    const top = below >= h + 8 || below >= t.top ? t.bottom + 6 : t.top - h - 6;
    const left = Math.min(Math.max(8, t.left), window.innerWidth - w - 8);
    setPos({ top: Math.max(8, top), left });
  }, []);

  function openPanel() {
    if (disabled) return;
    setFocus(selected ?? (minD && today < minD ? minD : today));
    setView("days");
    setOpen(true);
  }

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Top layer (Popover API) so dialogs with overflow:hidden don't clip the calendar.
  useLayoutEffect(() => {
    const p = panelRef.current;
    if (!p) return;
    const supported = typeof p.showPopover === "function";
    if (open) {
      if (supported && !p.matches(":popover-open")) p.showPopover();
      place();
    } else if (supported && p.matches(":popover-open")) {
      p.hidePopover();
    }
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, place, close]);

  // Keep keyboard focus on the active day.
  useEffect(() => {
    if (open && view === "days") gridRef.current?.querySelector<HTMLElement>(`[data-day="${toKey(focus)}"]`)?.focus({ preventScroll: true });
  }, [open, view, focus]);

  // ---- choosing -------------------------------------------------------------------------

  function emit(day: Date, t = time) {
    onChange(withTime ? `${toKey(day)}T${pad(t.h)}:${pad(t.m)}` : toKey(day));
  }

  function pick(day: Date) {
    if (outOfRange(day)) return;
    emit(day);
    if (!withTime) close();
    else setFocus(day);
  }

  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
      Home: () => addDays(focus, -((focus.getDay() - weekStartsOn + 7) % 7)),
      End: () => addDays(focus, 6 - ((focus.getDay() - weekStartsOn + 7) % 7)),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setFocus(moves[e.key]!());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(focus);
    }
  }

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      // Don't let Escape also close a surrounding dialog.
      e.preventDefault();
      e.stopPropagation();
      if (view === "months") setView("days");
      else close();
    }
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  const label = selected ? fmtTrigger.format(withTime ? new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), time.h, time.m) : selected) : null;
  const todayDisabled = outOfRange(today);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div
        className={cn(
          "group flex h-10 w-full items-center rounded-[10px] border bg-surface transition-[border-color,box-shadow] duration-150",
          open ? "border-ink-3 shadow-[0_0_0_3px_rgb(217_84_30/0.18)]" : "border-line hover:border-line-strong",
          aria["aria-invalid"] && "border-danger",
          disabled && "cursor-not-allowed bg-surface-muted",
        )}
      >
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => (open ? close() : openPanel())}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              openPanel();
            }
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-[10px] pl-3 pr-2 text-left text-[14px] focus-visible:outline-none disabled:cursor-not-allowed"
          {...aria}
        >
          <CalendarDays className={cn("size-4 shrink-0", open ? "text-brand-ink" : "text-ink-3")} aria-hidden />
          <span className={cn("min-w-0 truncate", label ? "text-ink" : "text-ink-3")}>{label ?? placeholder ?? (withTime ? "Pick a date and time" : "Pick a date")}</span>
        </button>
        {clearable && selected && !disabled ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              triggerRef.current?.focus();
            }}
            className="mr-2 rounded p-1 text-ink-3 hover:bg-surface-muted hover:text-ink"
            aria-label="Clear date"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <div
        ref={panelRef}
        id={panelId}
        popover="manual"
        role="dialog"
        aria-modal="false"
        aria-label={withTime ? "Choose date and time" : "Choose date"}
        onKeyDown={onPanelKey}
        style={pos ? { top: pos.top, left: pos.left } : undefined}
        className={cn(
          "fixed m-0 w-[19.5rem] rounded-[14px] border border-line bg-surface p-3 text-ink shadow-[0_18px_48px_rgb(17_17_17/0.2)]",
          // Fallback for browsers without the Popover API: plain fixed panel.
          open ? "z-[60] block" : "hidden",
        )}
      >
        {/* Header */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setView(view === "days" ? "months" : "days")}
            className="rounded-[8px] px-2 py-1 text-[14px] font-semibold text-ink hover:bg-surface-muted"
            aria-label={view === "days" ? `${fmtMonth.format(focus)}, choose another month` : "Back to days"}
          >
            {view === "days" ? fmtMonth.format(focus) : focus.getFullYear()}
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFocus(view === "days" ? addMonths(focus, -1) : addMonths(focus, -12))}
              className="grid size-8 place-items-center rounded-[8px] text-ink-2 hover:bg-surface-muted hover:text-ink"
              aria-label={view === "days" ? "Previous month" : "Previous year"}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setFocus(view === "days" ? addMonths(focus, 1) : addMonths(focus, 12))}
              className="grid size-8 place-items-center rounded-[8px] text-ink-2 hover:bg-surface-muted hover:text-ink"
              aria-label={view === "days" ? "Next month" : "Next year"}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {view === "days" ? (
          <div ref={gridRef} role="grid" aria-label={fmtMonth.format(focus)} onKeyDown={onGridKey}>
            <div role="row" className="mb-1 grid grid-cols-7">
              {weekdays.map((w) => (
                <span key={w.long} role="columnheader" aria-label={w.long} className="grid h-7 place-items-center text-[11.5px] font-medium text-ink-3">
                  {w.short}
                </span>
              ))}
            </div>
            {Array.from({ length: 6 }, (_, row) => (
              <div key={row} role="row" className="grid grid-cols-7">
                {days.slice(row * 7, row * 7 + 7).map((d) => {
                  const inMonth = d.getMonth() === focus.getMonth();
                  const isSel = sameDay(d, selected);
                  const isToday = sameDay(d, today);
                  const isFocus = sameDay(d, focus);
                  const off = outOfRange(d);
                  return (
                    <div key={toKey(d)} role="gridcell" aria-selected={isSel} className="grid place-items-center p-0.5">
                      <button
                        type="button"
                        data-day={toKey(d)}
                        tabIndex={isFocus ? 0 : -1}
                        disabled={off}
                        onClick={() => pick(d)}
                        aria-label={`${fmtLong.format(d)}${isToday ? ", today" : ""}${isSel ? ", selected" : ""}`}
                        aria-current={isToday ? "date" : undefined}
                        className={cn(
                          "relative grid size-9 place-items-center rounded-[9px] text-[13px] tabular transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
                          isSel ? "bg-brand font-semibold text-on-brand hover:bg-brand-strong" : inMonth ? "text-ink hover:bg-surface-muted" : "text-ink-3/70 hover:bg-surface-muted",
                          isToday && !isSel && "font-semibold text-brand-ink",
                          off && "cursor-not-allowed text-ink-3/40 line-through hover:bg-transparent",
                        )}
                      >
                        {d.getDate()}
                        {isToday && !isSel ? <span aria-hidden className="absolute bottom-1 size-1 rounded-full bg-brand" /> : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 py-1" role="listbox" aria-label={`Months of ${focus.getFullYear()}`}>
            {monthNames.map((name, i) => {
              const isCur = focus.getMonth() === i;
              return (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={isCur}
                  onClick={() => {
                    setFocus(new Date(focus.getFullYear(), i, Math.min(focus.getDate(), new Date(focus.getFullYear(), i + 1, 0).getDate())));
                    setView("days");
                  }}
                  className={cn("h-11 rounded-[9px] text-[13px]", isCur ? "bg-brand font-semibold text-on-brand" : "text-ink hover:bg-surface-muted")}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}

        {withTime ? (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <span className="text-[12.5px] text-ink-3">Time</span>
            <div className="w-[4.75rem]">
              <Dropdown
                aria-label="Hour"
                size="sm"
                value={String(time.h)}
                disabled={!selected}
                options={hours.map((h) => ({ value: String(h), label: <span className="font-mono">{pad(h)}</span>, text: pad(h) }))}
                onValueChange={(v) => selected && emit(selected, { h: Number(v), m: time.m })}
              />
            </div>
            <span className="font-mono text-ink-3">:</span>
            <div className="w-[4.75rem]">
              <Dropdown
                aria-label="Minute"
                size="sm"
                value={String(minutes.includes(time.m) ? time.m : minutes[0])}
                disabled={!selected}
                options={minutes.map((m) => ({ value: String(m), label: <span className="font-mono">{pad(m)}</span>, text: pad(m) }))}
                onValueChange={(v) => selected && emit(selected, { h: time.h, m: Number(v) })}
              />
            </div>
            {!selected ? <span className="text-[11.5px] text-ink-3">Pick a day first</span> : null}
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
          <button
            type="button"
            disabled={todayDisabled}
            onClick={() => {
              setFocus(today);
              setView("days");
              pick(today);
            }}
            className="rounded-[8px] px-2 py-1 text-[12.5px] font-medium text-brand-ink hover:bg-brand-tint disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent"
          >
            Today
          </button>
          <div className="flex items-center gap-1">
            {clearable && selected ? (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  close();
                }}
                className="rounded-[8px] px-2 py-1 text-[12.5px] text-ink-2 hover:bg-surface-muted hover:text-ink"
              >
                Clear
              </button>
            ) : null}
            {withTime ? (
              <button type="button" onClick={() => close()} className="rounded-[8px] bg-ink px-3 py-1 text-[12.5px] font-medium text-canvas hover:bg-ink/85">
                Done
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
