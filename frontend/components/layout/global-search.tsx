"use client";

import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Building,
  ClipboardList,
  Clock,
  CornerDownLeft,
  FileSearch,
  FileText,
  FolderOpen,
  FolderPlus,
  type LucideIcon,
  MessageCircle,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";
import type { SearchHit } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { useDismiss } from "@/lib/use-dismiss";
import { useSearchQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

interface Item {
  key: string;
  label: string;
  hint?: string | null;
  badge?: string | null;
  icon: LucideIcon;
  run: () => void;
}

interface Group {
  title: string;
  items: Item[];
}

const RECENT_KEY = "ow-recent-searches";
const KIND: Record<SearchHit["kind"], { title: string; icon: LucideIcon }> = {
  case: { title: "Cases", icon: FolderOpen },
  supplier: { title: "Suppliers", icon: Building },
  purchase_order: { title: "Purchase orders", icon: ClipboardList },
  finding: { title: "Findings", icon: FileSearch },
  document: { title: "Documents", icon: FileText },
};
const ORDER: SearchHit["kind"][] = ["case", "supplier", "purchase_order", "finding", "document"];

function readRecent(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function humanBadge(b: string | null | undefined) {
  return b ? b.replace(/_/g, " ") : null;
}

/**
 * Top-bar search. Focus shows quick actions, recent searches and shortcuts;
 * typing searches cases, suppliers, purchase orders, findings and documents.
 * Up/Down to move, Enter to open, Escape to close, Ctrl/Cmd+K from anywhere.
 */
export function GlobalSearch() {
  const router = useRouter();
  const { workspace, can } = useWorkspace();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const term = useDebounced(query.trim(), 180);
  const { data, isFetching } = useSearchQuery({ workspaceId: workspace.id, q: term }, { skip: term.length < 2 });

  useEffect(() => setRecent(readRecent()), []);
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, open, close);

  const remember = useCallback((q: string) => {
    const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5);
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    setRecent(next);
  }, []);

  const go = useCallback(
    (href: string, q?: string) => {
      if (q) remember(q);
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
      router.push(href);
    },
    [router, remember],
  );

  const groups: Group[] = useMemo(() => {
    const q = query.trim();
    if (q.length >= 2) {
      const out: Group[] = [
        {
          title: "Search",
          items: [{ key: "all", label: `Search all cases for “${q}”`, icon: Search, run: () => go(`/app/investigations?search=${encodeURIComponent(q)}`, q) }],
        },
      ];
      const hits = term === q || data?.query === term ? (data?.hits ?? []) : [];
      for (const kind of ORDER) {
        const of = hits.filter((h) => h.kind === kind);
        if (!of.length) continue;
        out.push({
          title: KIND[kind].title,
          items: of.map((h) => ({ key: `${h.kind}-${h.id}`, label: h.title, hint: h.subtitle, badge: humanBadge(h.badge), icon: KIND[kind].icon, run: () => go(h.href, q) })),
        });
      }
      return out;
    }
    const actions: Item[] = [];
    if (can("create_case")) actions.push({ key: "new-case", label: "Open a new investigation", icon: FolderPlus, run: () => go("/app/investigations/new") });
    if (can("manage_register")) {
      actions.push({ key: "new-supplier", label: "Register a supplier", icon: Building, run: () => go("/app/suppliers?new=1") });
      actions.push({ key: "new-po", label: "Register a purchase order", icon: ClipboardList, run: () => go("/app/purchase-orders?new=1") });
    }
    actions.push({
      key: "warden",
      label: "Ask Warden",
      hint: "Type or talk",
      icon: MessageCircle,
      run: () => {
        setOpen(false);
        window.dispatchEvent(new Event("ow:assistant"));
      },
    });
    const out: Group[] = [];
    if (recent.length) {
      out.push({
        title: "Recent searches",
        items: recent.map((r) => ({ key: `recent-${r}`, label: r, icon: Clock, run: () => go(`/app/investigations?search=${encodeURIComponent(r)}`, r) })),
      });
    }
    out.push({ title: "Quick actions", items: actions });
    out.push({
      title: "Jump to",
      items: [
        { key: "j-review", label: "Cases that need review", icon: AlertCircle, run: () => go("/app/investigations?status=needs_review") },
        { key: "j-approvals", label: "Approvals waiting", icon: ShieldCheck, run: () => go("/app/approvals") },
        { key: "j-findings", label: "All findings", icon: FileSearch, run: () => go("/app/findings") },
        { key: "j-pos", label: "Purchase orders", icon: ClipboardList, run: () => go("/app/purchase-orders") },
      ],
    });
    return out;
  }, [query, term, data, recent, can, go]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  useEffect(() => setActive(0), [query, open]);
  useEffect(() => {
    if (open) wrapRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[active];
      if (item) item.run();
      else if (query.trim()) go(`/app/investigations?search=${encodeURIComponent(query.trim())}`, query.trim());
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
  }

  const searching = query.trim().length >= 2 && (isFetching || term !== query.trim());
  const noHits = query.trim().length >= 2 && !searching && flat.length === 1;
  let index = -1;

  return (
    <div ref={wrapRef} className="relative w-full max-w-md" role="search">
      <label htmlFor="global-search" className="sr-only">Search cases, suppliers and purchase orders</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        id="global-search"
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && flat[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Search cases, suppliers, POs…"
        className={cn(
          "h-9 w-full rounded-[10px] border bg-surface pl-9 pr-16 text-[13.5px] text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] hover:border-line-strong focus-visible:outline-none",
          open ? "border-ink-3 shadow-[0_0_0_3px_rgb(217_84_30/0.18)]" : "border-line",
        )}
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink"
          aria-label="Clear search"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-[6px] border border-line bg-canvas px-1.5 py-0.5 font-sans text-[11px] text-ink-3 sm:block">
          Ctrl K
        </kbd>
      )}

      {open ? (
        <div className="pop-in absolute left-0 top-full z-40 mt-2 w-[min(92vw,34rem)] origin-top-left overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_20px_50px_rgb(17_17_17/0.18)]">
          <div id={listId} role="listbox" aria-label="Search suggestions" className="max-h-[min(70vh,28rem)] overflow-y-auto p-1.5">
            {groups.map((g) => (
              <div key={g.title} role="group" aria-label={g.title} className="py-1">
                <p className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-medium text-ink-3">{g.title}</p>
                {g.items.map((item) => {
                  index += 1;
                  const i = index;
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.key}
                      id={`${listId}-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={item.run}
                      className={cn("flex cursor-pointer items-center gap-3 rounded-[9px] px-2.5 py-2", i === active ? "bg-surface-muted" : "")}
                    >
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-[7px] border", i === active ? "border-line-strong bg-surface text-ink" : "border-line text-ink-3")}>
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink">{item.label}</span>
                        {item.hint ? <span className="block truncate text-[12px] text-ink-3">{item.hint}</span> : null}
                      </span>
                      {item.badge ? <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] capitalize text-ink-2">{item.badge}</span> : null}
                      {i === active ? <ArrowRight className="size-3.5 shrink-0 text-ink-3" aria-hidden /> : null}
                    </div>
                  );
                })}
              </div>
            ))}
            {searching ? <p className="px-3 py-2 text-[12.5px] text-ink-3" role="status">Searching…</p> : null}
            {noHits ? <p className="px-3 py-2 text-[12.5px] text-ink-3" role="status">No cases, suppliers or orders match “{query.trim()}”.</p> : null}
          </div>
          <div className="flex items-center gap-4 border-t border-line bg-canvas/60 px-3 py-2 text-[11.5px] text-ink-3">
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-line bg-surface px-1">↑</kbd><kbd className="rounded border border-line bg-surface px-1">↓</kbd> move</span>
            <span className="inline-flex items-center gap-1"><CornerDownLeft className="size-3" aria-hidden /> open</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-line bg-surface px-1">Esc</kbd> close</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
