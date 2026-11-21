"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import { useDismiss } from "@/lib/use-dismiss";

export interface DropdownOption {
  value: string;
  label: ReactNode;
  /** Plain text used for type-ahead and the trigger tooltip. */
  text: string;
  disabled?: boolean;
}

/** Reads `<option>` children so existing `<Select><option/></Select>` markup keeps working. */
export function optionsFromChildren(children: ReactNode): DropdownOption[] {
  const out: DropdownOption[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    if (el.type !== "option") return;
    const label = el.props.children;
    const text = Children.toArray(label)
      .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
      .join("");
    out.push({ value: String(el.props.value ?? text), label, text, disabled: el.props.disabled });
  });
  return out;
}

export interface DropdownProps {
  id?: string;
  value: string;
  options: DropdownOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  title?: string;
  name?: string;
  size?: "sm" | "md";
  "aria-describedby"?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}

/**
 * Custom listbox. Keyboard: Up/Down/Home/End move, Enter/Space choose, Escape
 * closes, typing jumps to a matching option. Focus stays on the trigger and
 * the active option is announced via aria-activedescendant.
 */
export function Dropdown({
  id,
  value,
  options,
  onValueChange,
  disabled,
  placeholder = "Select…",
  className,
  title,
  name,
  size = "md",
  ...aria
}: DropdownProps) {
  const autoId = useId();
  const triggerId = id ?? autoId;
  const listId = `${triggerId}-list`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState<{ up: boolean; width: number }>({ up: false, width: 0 });
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, open, close);

  const enabledIndex = useCallback(
    (from: number, step: 1 | -1) => {
      for (let i = from, n = 0; n < options.length; i += step, n++) {
        const idx = (i + options.length) % options.length;
        if (!options[idx]?.disabled) return idx;
      }
      return -1;
    },
    [options],
  );

  function openList(at?: number) {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setPlacement({ up: below < 280 && rect.top > below, width: rect.width });
    }
    setActive(at ?? (selectedIndex >= 0 ? selectedIndex : enabledIndex(0, 1)));
    setOpen(true);
  }

  function choose(i: number) {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    if (opt.value !== value) onValueChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Keep the active option in view.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => enabledIndex(a + 1, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => enabledIndex(a - 1, -1));
        return;
      case "Home":
        if (open) {
          e.preventDefault();
          setActive(enabledIndex(0, 1));
        }
        return;
      case "End":
        if (open) {
          e.preventDefault();
          setActive(enabledIndex(options.length - 1, -1));
        }
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        if (open) choose(active);
        else openList();
        return;
      case "Escape":
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
        return;
      case "Tab":
        setOpen(false);
        return;
    }
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at > 700 ? e.key.toLowerCase() : typed.current.text + e.key.toLowerCase(), at: now };
      const match = options.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(typed.current.text));
      if (match >= 0) {
        if (open) setActive(match);
        else if (options[match]!.value !== value) onValueChange(options[match]!.value);
      }
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        disabled={disabled}
        title={title ?? selected?.text}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        {...aria}
        className={cn(
          "group flex w-full items-center justify-between gap-2 rounded-[10px] border bg-surface text-left text-ink",
          "transition-[border-color,box-shadow] duration-150",
          size === "sm" ? "h-9 px-3 text-[13px]" : "h-10 px-3 text-[14px]",
          open ? "border-ink-3 shadow-[0_0_0_3px_rgb(217_84_30/0.18)]" : "border-line hover:border-line-strong",
          "focus-visible:border-ink focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgb(217_84_30/0.25)]",
          "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-3",
          aria["aria-invalid"] && "border-danger",
          className,
        )}
      >
        <span className={cn("min-w-0 truncate", !selected && "text-ink-3")}>{selected ? selected.label : placeholder}</span>
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-200", open && "rotate-180 text-ink")} />
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={triggerId}
          tabIndex={-1}
          style={{ minWidth: placement.width || undefined }}
          className={cn(
            "pop-in absolute left-0 z-50 max-h-72 overflow-auto rounded-[10px] border border-line bg-surface p-1 shadow-[0_16px_40px_rgb(17_17_17/0.14)]",
            placement.up ? "bottom-full mb-1.5 origin-bottom" : "top-full mt-1.5 origin-top",
          )}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={`${o.value}-${i}`}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                onPointerMove={() => !o.disabled && setActive(i)}
                onPointerDown={(e) => e.preventDefault()} // keep focus on the trigger
                onClick={() => choose(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 whitespace-nowrap rounded-[7px] px-2.5 py-2 text-[13.5px]",
                  i === active ? "bg-brand-tint text-ink" : "text-ink-2",
                  isSelected && "font-medium text-ink",
                  o.disabled && "cursor-not-allowed opacity-45",
                )}
              >
                <span>{o.label}</span>
                {isSelected ? <Check aria-hidden className="size-3.5 text-brand-ink" /> : <span className="size-3.5" />}
              </li>
            );
          })}
          {options.length === 0 ? <li className="px-2.5 py-2 text-[13px] text-ink-3">No options</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/** Adapter: lets `<Dropdown>` stand in for a native `<select onChange={(e) => e.target.value}>`. */
export function selectChangeEvent(value: string): ChangeEvent<HTMLSelectElement> {
  const target = { value } as HTMLSelectElement;
  return { target, currentTarget: target } as ChangeEvent<HTMLSelectElement>;
}

export function useOptions(children: ReactNode) {
  return useMemo(() => optionsFromChildren(children), [children]);
}
