"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { useWorkspace } from "@/store/hooks";

import { LogoMark } from "./logo";
import { NAV_SECTIONS, isNavActive } from "./nav-items";
import { useSidebarCounts } from "./use-sidebar-counts";
import { UserMenu } from "./user-menu";

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
  /** Desktop only. Pinned: 256px, content sits beside it. Unpinned: 72px rail that expands over content on hover. */
  pinned: boolean;
  onTogglePin: () => void;
}

export function Sidebar({ mobileOpen, onClose, pinned, onTogglePin }: SidebarProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { workspace, can } = useWorkspace();
  const counts = useSidebarCounts();
  /*
   * Right after you collapse the sidebar, the pointer is still over it and the
   * toggle still has focus, which would immediately re-expand it on hover.
   * Hold it collapsed until the pointer leaves once.
   */
  const [holdCollapsed, setHoldCollapsed] = useState(false);
  const expandable = !pinned && !holdCollapsed;

  function togglePin() {
    if (pinned) {
      setHoldCollapsed(true);
      (document.activeElement as HTMLElement | null)?.blur();
    } else {
      setHoldCollapsed(false);
    }
    onTogglePin();
  }

  // Text that is hidden on the collapsed rail and fades in when it expands. Always visible when pinned or on mobile.
  const reveal = pinned
    ? ""
    : expandable
      ? "transition-opacity duration-150 lg:opacity-0 lg:group-hover/side:opacity-100 lg:group-hover/side:delay-75 lg:group-focus-within/side:opacity-100 lg:group-has-[[data-menu-open]]/side:opacity-100"
      : "transition-opacity duration-150 lg:opacity-0 lg:pointer-events-none";
  const railHide = expandable ? "lg:group-hover/side:hidden lg:group-focus-within/side:hidden lg:group-has-[[data-menu-open]]/side:hidden" : "";

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm transition-opacity lg:hidden print:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        aria-label="Primary navigation"
        onPointerLeave={() => setHoldCollapsed(false)}
        className={cn(
          "group/side fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-hidden border-r border-nav-line bg-nav text-nav-text print:hidden",
          "transition-[translate,width,box-shadow] duration-300 ease-[var(--ease-drawer)] lg:translate-x-0",
          pinned
            ? "lg:w-64"
            : expandable
              ? "lg:w-[72px] lg:hover:w-64 lg:hover:delay-100 lg:hover:shadow-[12px_0_32px_rgb(17_17_17/0.12)] lg:focus-within:w-64 lg:has-[[data-menu-open]]:w-64"
              : "lg:w-[72px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full max-lg:invisible",
        )}
      >
        {/* Brand */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-[18px]">
          <Link href="/app/overview" aria-label="OpsWarden dashboard" onClick={onClose} className="flex min-w-0 items-center gap-2.5">
            <LogoMark tone="dark" className="size-9 shrink-0" />
            <span className={cn("flex items-baseline whitespace-nowrap text-[20px] leading-none", reveal)}>
              <span className="font-semibold tracking-tight">Ops</span>
              <span className="display italic">Warden</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={togglePin}
            className={cn(
              "pressable hidden shrink-0 rounded-[8px] p-1.5 text-nav-muted hover:bg-nav-raised hover:text-nav-text",
              pinned ? "lg:inline-flex" : expandable ? "lg:group-hover/side:inline-flex lg:group-focus-within/side:inline-flex" : "",
            )}
            aria-label={pinned ? "Collapse sidebar" : "Keep sidebar open"}
            title={pinned ? "Collapse sidebar" : "Keep sidebar open"}
          >
            {pinned ? <PanelLeftClose className="size-4" aria-hidden /> : <PanelLeftOpen className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="pressable rounded-[8px] p-1.5 text-nav-muted hover:bg-nav-raised hover:text-nav-text lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Workspace */}
        <div className="mx-3 mb-2 flex shrink-0 items-center gap-2.5 rounded-[10px] border border-nav-line bg-nav-raised px-2 py-2">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-ink font-mono text-[12px] font-medium text-canvas">
            {workspace.name.slice(0, 2).toUpperCase()}
          </span>
          <span className={cn("min-w-0 whitespace-nowrap", reveal)}>
            <span className="block truncate text-[13px] font-medium">{workspace.name}</span>
            <span className="block text-[11.5px] capitalize text-nav-muted">{workspace.role}</span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="no-scrollbar flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3">
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) => !item.permission || can(item.permission));
            if (!items.length) return null;
            return (
              <div key={section.label} className="mt-3 first:mt-1">
                <p className={cn("px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] whitespace-nowrap text-nav-muted", reveal)}>
                  {section.label}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = isNavActive(item, pathname, params);
                    const count = item.badge ? counts[item.badge] : 0;
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          aria-current={active ? "page" : undefined}
                          aria-label={count ? `${item.label}, ${count}` : undefined}
                          title={pinned ? undefined : item.label}
                          className={cn(
                            "relative flex h-9 items-center gap-3 rounded-[8px] border px-3 text-[13.5px] transition-colors",
                            active
                              ? "border-nav-line bg-nav-raised font-medium text-nav-text shadow-[0_1px_2px_rgb(17_17_17/0.06)]"
                              : "border-transparent text-nav-muted hover:bg-nav-raised/60 hover:text-nav-text",
                          )}
                        >
                          <span className="relative shrink-0">
                            <Icon aria-hidden className={cn("size-[17px]", active && "text-brand-ink")} />
                            {count > 0 && !pinned ? (
                              <span aria-hidden className={cn("absolute -top-1 -right-1 size-2 rounded-full bg-brand ring-2 ring-nav max-lg:hidden", railHide)} />
                            ) : null}
                          </span>
                          <span className={cn("flex-1 truncate whitespace-nowrap", reveal)}>{item.label}</span>
                          {count > 0 ? (
                            <span
                              className={cn(
                                "tabular rounded-full px-1.5 text-[11.5px] leading-[18px]",
                                item.badge === "approvals" || item.badge === "needsReview" ? "bg-brand text-on-brand" : "border border-nav-line bg-nav-raised text-nav-muted",
                                reveal,
                              )}
                            >
                              {count > 99 ? "99+" : count}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-nav-line p-3">
          <UserMenu collapsedClass={reveal} />
        </div>
      </aside>
    </>
  );
}
