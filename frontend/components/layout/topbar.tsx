"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Keyboard, Menu, Search, Settings } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useWorkspace } from "@/store/hooks";

import { NotificationsMenu } from "./notifications-menu";

const iconBtn =
  "pressable grid size-9 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink";

/** Minimal top bar: search on the left, a few round icon buttons on the right. */
export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const router = useRouter();
  const { can } = useWorkspace();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/app/investigations?search=${encodeURIComponent(q)}` : "/app/investigations");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/85 backdrop-blur-md print:hidden">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={onOpenNav} className={`${iconBtn} lg:hidden`} aria-label="Open navigation">
          <Menu className="size-4" aria-hidden />
        </button>

        <form role="search" onSubmit={onSubmit} className="relative w-full max-w-xs">
          <label htmlFor="global-search" className="sr-only">Search cases and suppliers</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            id="global-search"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-14 text-[13.5px] text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] hover:border-line-strong focus-visible:border-ink-3 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgb(217_84_30/0.18)]"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-[6px] border border-line bg-canvas px-1.5 py-0.5 font-sans text-[11px] text-ink-3 sm:block">
            Ctrl K
          </kbd>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <NotificationsMenu />
          {can("manage_workspace") ? (
            <Link href="/app/settings" className={iconBtn} aria-label="Settings" title="Settings">
              <Settings className="size-4" aria-hidden />
            </Link>
          ) : (
            <button type="button" onClick={() => window.dispatchEvent(new Event("ow:shortcuts"))} className={`${iconBtn} max-sm:hidden`} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
              <Keyboard className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
