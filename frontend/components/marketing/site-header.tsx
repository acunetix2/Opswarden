"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { LandingCta, SignInLink } from "@/components/landing/landing-cta";
import { LogoMark } from "@/components/layout/logo";
import { cn } from "@/lib/cn";

import { MAIN_NAV, type MenuLink, type NavEntry } from "./nav-config";

function isActive(pathname: string, href: string) {
  const path = href.split("#")[0]!;
  return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Dropdown that opens on hover (with a short intent delay so passing the cursor
 * over it doesn't flash it) or on click/Enter, closes on Escape or outside click,
 * and scales in from its trigger.
 */
function NavMenu({ entry, pathname }: { entry: Extract<NavEntry, { items: MenuLink[] }>; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const id = useId();
  const active = entry.items.some((i) => isActive(pathname, i.href));

  function later(fn: () => void, ms: number) {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div
      ref={ref}
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && later(() => setOpen(true), 80)}
      onPointerLeave={(e) => e.pointerType === "mouse" && later(() => setOpen(false), 140)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13.5px] transition-colors duration-150",
          active || open ? "bg-surface-muted text-ink" : "text-ink-2 hover:bg-surface-muted hover:text-ink",
        )}
      >
        {entry.label}
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-200 ease-out", open && "rotate-180")} />
      </button>
      {open ? (
        <div id={id} className="pop-in absolute left-1/2 top-full z-40 w-[22rem] -translate-x-1/2 origin-top pt-2">
          <ul className="rounded-[16px] border border-line bg-surface p-2 shadow-[0_18px_50px_-12px_rgb(17_17_17/0.25)]">
            {entry.items.map(({ href, label, description, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 rounded-[12px] px-3 py-2.5 transition-colors duration-150 hover:bg-canvas"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-canvas text-ink-2">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium text-ink">{label}</span>
                    <span className="block text-[12.5px] leading-snug text-ink-3">{description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  // Lock page scroll while the mobile sheet is open.
  useEffect(() => {
    document.documentElement.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-200",
        scrolled ? "border-line bg-canvas/85 shadow-[0_6px_24px_-18px_rgb(17_17_17/0.35)] backdrop-blur-md" : "border-transparent bg-canvas",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="OpsWarden home">
          <LogoMark className="size-9" />
          <span className="flex items-baseline text-[20px] leading-none text-ink">
            <span className="font-semibold tracking-tight">Ops</span>
            <span className="display italic">Warden</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-0.5 lg:flex">
          {MAIN_NAV.map((entry) =>
            "items" in entry ? (
              <NavMenu key={entry.label} entry={entry} pathname={pathname} />
            ) : (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={isActive(pathname, entry.href) ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13.5px] transition-colors duration-150",
                  isActive(pathname, entry.href) ? "bg-surface-muted font-medium text-ink" : "text-ink-2 hover:bg-surface-muted hover:text-ink",
                )}
              >
                {entry.label}
              </Link>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Link href="/contact" className="hidden rounded-full px-3 py-1.5 text-[13.5px] text-ink-2 hover:text-ink xl:inline-flex">
            Talk to us
          </Link>
          <SignInLink />
          <LandingCta size="sm" signup />
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="btn grid size-9 place-items-center rounded-full border border-line bg-surface text-ink lg:hidden"
          >
            {mobileOpen ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {mobileOpen ? (
        <div id="mobile-nav" className="pop-in fixed inset-x-0 top-16 bottom-0 z-40 origin-top overflow-y-auto border-t border-line bg-canvas lg:hidden">
          <nav aria-label="Main" className="mx-auto max-w-6xl space-y-1 px-5 py-5">
            {MAIN_NAV.map((entry) =>
              "items" in entry ? (
                <details key={entry.label} className="faq group rounded-[14px] border border-line bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[15px] font-medium text-ink">
                    {entry.label}
                    <ChevronDown className="size-4 text-ink-3 transition-transform duration-200 group-open:rotate-180" aria-hidden />
                  </summary>
                  <ul className="px-2 pb-2">
                    {entry.items.map((i) => (
                      <li key={i.href}>
                        <Link href={i.href} className="flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-canvas">
                          <i.Icon className="size-4 text-ink-3" aria-hidden />
                          <span className="text-[14px] text-ink">{i.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <Link
                  key={entry.href}
                  href={entry.href}
                  aria-current={isActive(pathname, entry.href) ? "page" : undefined}
                  className={cn(
                    "block rounded-[14px] border px-4 py-3 text-[15px] font-medium",
                    isActive(pathname, entry.href) ? "border-line-strong bg-surface text-ink" : "border-transparent text-ink-2 hover:bg-surface",
                  )}
                >
                  {entry.label}
                </Link>
              ),
            )}
            <div className="flex gap-2 pt-4">
              <LandingCta className="h-11 flex-1" signup />
              <Link href="/contact" className="btn inline-flex h-11 flex-1 items-center justify-center rounded-[8px] border border-line-strong bg-surface text-[15px] font-medium text-ink">
                Talk to us
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
