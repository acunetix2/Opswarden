"use client";

import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { useDismiss } from "@/lib/use-dismiss";

export interface ComboOption {
  value: string;
  label: string;
  /** Second line under the label. */
  hint?: string;
  /** Extra words matched by the filter (codes, emails…). */
  keywords?: string;
  aside?: ReactNode;
  disabled?: boolean;
}

interface ComboboxProps {
  id?: string;
  value: string | null;
  options: ComboOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Offer "Add “typed text”" when nothing matches exactly. */
  onCreate?: (text: string) => void;
  createLabel?: (text: string) => string;
  clearable?: boolean;
  "aria-describedby"?: string;
}

/**
 * Searchable picker: type to filter, Up/Down to move, Enter to choose, Escape
 * to close. Optional "Add …" row lets people register something new inline.
 */
export function Combobox({
  id,
  value,
  options,
  onChange,
  placeholder = "Search…",
  emptyText = "No matches",
  disabled,
  loading,
  onCreate,
  createLabel = (t) => `Add “${t}”`,
  clearable = true,
  ...aria
}: ComboboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.keywords ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);

  const typed = query.trim();
  const canCreate = Boolean(onCreate && typed && !options.some((o) => o.label.toLowerCase() === typed.toLowerCase()));
  const rows = filtered.length + (canCreate ? 1 : 0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  useDismiss(wrapRef, open, close);

  useEffect(() => setActive(0), [query, open]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(i: number) {
    if (i < filtered.length) {
      const opt = filtered[i]!;
      if (opt.disabled) return;
      onChange(opt.value);
    } else if (canCreate) {
      onCreate?.(typed);
    }
    close();
    inputRef.current?.blur();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(rows - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      if (open && rows) {
        e.preventDefault();
        choose(active);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    } else if (e.key === "Tab") {
      close();
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-[10px] border bg-surface px-3 transition-[border-color,box-shadow] duration-150",
          open ? "border-ink-3 shadow-[0_0_0_3px_rgb(217_84_30/0.18)]" : "border-line hover:border-line-strong",
          disabled && "cursor-not-allowed bg-surface-muted",
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && rows ? `${listId}-${active}` : undefined}
          autoComplete="off"
          disabled={disabled}
          value={open ? query : (selected?.label ?? "")}
          placeholder={selected ? selected.label : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-3 focus-visible:outline-none disabled:cursor-not-allowed"
          {...aria}
        />
        {clearable && selected && !disabled ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              inputRef.current?.focus();
            }}
            className="rounded p-0.5 text-ink-3 hover:text-ink"
            aria-label="Clear selection"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
        <ChevronsUpDown className="size-4 shrink-0 text-ink-3" aria-hidden />
      </div>

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="pop-in absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 origin-top overflow-y-auto rounded-[12px] border border-line bg-surface p-1 shadow-[0_16px_40px_rgb(17_17_17/0.16)]"
        >
          {loading ? <li className="px-3 py-2.5 text-[13px] text-ink-3">Loading…</li> : null}
          {!loading && rows === 0 ? <li className="px-3 py-2.5 text-[13px] text-ink-3">{emptyText}</li> : null}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2",
                i === active ? "bg-surface-muted" : "",
                o.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-ink">{o.label}</span>
                {o.hint ? <span className="block truncate text-[12px] text-ink-3">{o.hint}</span> : null}
              </span>
              {o.aside ? <span className="shrink-0 text-[12px] text-ink-3">{o.aside}</span> : null}
              {o.value === value ? <Check className="size-4 shrink-0 text-brand-ink" aria-hidden /> : null}
            </li>
          ))}
          {canCreate ? (
            <li
              id={`${listId}-${filtered.length}`}
              data-index={filtered.length}
              role="option"
              aria-selected={false}
              onMouseEnter={() => setActive(filtered.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(filtered.length)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-[8px] border-t border-line px-3 py-2 text-[13.5px] font-medium text-brand-ink",
                active === filtered.length && "bg-brand-tint",
              )}
            >
              <Plus className="size-4" aria-hidden />
              {createLabel(typed)}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
