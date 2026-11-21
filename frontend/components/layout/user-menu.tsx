"use client";

import { Check, ChevronsUpDown, Keyboard, LogOut, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { useDismiss } from "@/lib/use-dismiss";
import { useSession } from "@/store/hooks";

/** Sidebar footer: who you are, switch workspace, theme, shortcuts, sign out. */
export function UserMenu({ collapsedClass }: { collapsedClass?: string }) {
  const { user, workspace, workspaces, selectWorkspace, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  // The inline script in app/layout.tsx applies the saved theme before paint; read it back here.
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      window.localStorage.setItem("ow-theme", next ? "dark" : "light");
    } catch {
      // Storage disabled: the theme still applies until reload.
    }
  }

  if (!user || !workspace) return null;

  return (
    <div ref={ref} className="relative" data-menu-open={open || undefined}>
      {open ? (
        <div id={menuId} role="menu" aria-label="Account" className="pop-in absolute bottom-full left-0 mb-2 w-[16.5rem] origin-bottom overflow-hidden rounded-[6px] border border-nav-line bg-nav-raised shadow-[0_12px_32px_rgb(17_17_17/0.14)]">
          <p className="px-3 pt-3 pb-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-nav-muted">Switch workspace</p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              role="menuitemradio"
              aria-checked={w.id === workspace.id}
              type="button"
              onClick={() => {
                selectWorkspace(w.id);
                close();
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-nav-text hover:bg-nav-line"
            >
              <span className="min-w-0">
                <span className="block truncate">{w.name}</span>
                <span className="block font-mono text-[10.5px] uppercase tracking-[0.06em] text-nav-muted">{ROLE_DESCRIPTIONS[w.role].label}</span>
              </span>
              {w.id === workspace.id ? <Check className="size-4 text-brand" aria-hidden /> : null}
            </button>
          ))}
          <div className="mt-1 border-t border-nav-line">
            <button
              role="menuitemcheckbox"
              aria-checked={dark}
              type="button"
              onClick={toggleTheme}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] text-nav-text hover:bg-nav-line"
            >
              {dark ? <Sun className="size-4 text-nav-muted" aria-hidden /> : <Moon className="size-4 text-nav-muted" aria-hidden />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                close();
                window.dispatchEvent(new Event("ow:shortcuts"));
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] text-nav-text hover:bg-nav-line"
            >
              <Keyboard className="size-4 text-nav-muted" aria-hidden />
              Keyboard shortcuts
              <kbd className="ml-auto font-mono text-[11px] text-nav-muted">?</kbd>
            </button>
            <button role="menuitem" type="button" onClick={signOut} className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] text-nav-text hover:bg-nav-line">
              <LogOut className="size-4 text-nav-muted" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Account: ${user.full_name || user.email}`}
        className={cn("pressable flex w-full items-center gap-3 rounded-[10px] px-1.5 py-1.5 text-left hover:bg-nav-raised", open && "bg-nav-raised")}
      >
        <Avatar name={user.full_name || user.email} className="rounded-full" />
        <span className={cn("min-w-0 flex-1 whitespace-nowrap", collapsedClass)}>
          <span className="block truncate text-[13px] font-medium text-nav-text">{user.full_name || user.email}</span>
          <span className="block truncate text-[11.5px] text-nav-muted">{user.email}</span>
        </span>
        <ChevronsUpDown className={cn("size-4 shrink-0 text-nav-muted", collapsedClass)} aria-hidden />
      </button>
    </div>
  );
}
