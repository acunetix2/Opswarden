"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CountBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

import { usePendingApprovals } from "./use-pending-approvals";

const ITEMS: { href: string; label: string; index: string; badge?: boolean }[] = [
  { href: "/app/overview", label: "Home", index: "01" },
  { href: "/app/investigations", label: "Cases", index: "02" },
  { href: "/app/approvals", label: "Approve", index: "04", badge: true },
  { href: "/app/documents", label: "Docs", index: "05" },
];

/** Thumb-reachable index strip below lg. "More" opens the full drawer. */
export function BottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const pending = usePendingApprovals();

  return (
    <nav aria-label="Primary (mobile)" className="fixed inset-x-0 bottom-0 z-30 border-t border-nav-line bg-nav pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
      <ul className="grid grid-cols-5 divide-x divide-nav-line">
        {ITEMS.map(({ href, label, index, badge }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex h-16 flex-col items-center justify-center gap-1", active ? "text-nav-text" : "text-nav-muted")}
              >
                {active ? <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-brand" /> : null}
                <span className={cn("font-mono text-[10px]", active ? "text-brand" : "text-nav-muted/70")}>{index}</span>
                <span className="flex items-center gap-1 text-[12px] font-medium">
                  {label}
                  {badge ? <CountBadge count={pending} /> : null}
                </span>
                {badge && pending > 0 ? <span className="sr-only">, {pending} pending</span> : null}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={onMore} className="flex h-16 w-full flex-col items-center justify-center gap-1 text-nav-muted">
            <span className="font-mono text-[10px] text-nav-muted/70">··</span>
            <span className="text-[12px] font-medium">More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
