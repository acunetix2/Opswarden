"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { LandingCta, SignInLink } from "@/components/landing/landing-cta";
import { LogoMark } from "@/components/layout/logo";
import { cn } from "@/lib/cn";

import { MAIN_NAV, type MenuLink, type NavEntry } from "./nav-config";

function isActive(pathname: string, href: string) {
  const path = href.split("#")[0]!;
  return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Dropdown that opens on hover (short intent delay so passing over it doesn't
 * flash it) or on click/Enter, closes on Escape or outside click, and scales in
 * from its trigger.
 */
function NavMenu({ entry, pathname, light }: { entry: Extract<NavEntry, { items: MenuLink[] }>; pathname: string; light: boolean }) {
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
      data-nav-item
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
          "relative z-[1] inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors duration-150",
          light ? "text-[#F3EEE3]/80 hover:text-[#F3EEE3]" : active || open ? "text-ink" : "text-ink-2 hover:text-ink",
          active && "font-medium",
        )}
      >
        {entry.label}
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-200 ease-out", open && "rotate-180")} />
      </button>
      {open ? (
        <div id={id} className="pop-in absolute left-1/2 top-full z-40 w-[23rem] -translate-x-1/2 origin-top pt-3">
          <ul className="rounded-[18px] border border-line bg-surface p-2 text-ink shadow-[0_24px_60px_-16px_rgb(17_17_17/0.35)]">
            {entry.items.map(({ href, label, description, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="group flex items-start gap-3 rounded-[12px] px-3 py-2.5 transition-colors duration-150 hover:bg-canvas"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-canvas text-ink-2 transition-colors duration-150 group-hover:border-brand/40 group-hover:text-brand-ink">
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

/**
 * Floating header. Over the dark home hero it starts transparent with light text,
 * then settles into a frosted pill once you scroll. A highlight slides between
 * links under the pointer, and a thin line along the bottom shows how far down
 * the page you are.
 */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const progressRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 24);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      // Written straight to the element: no re-render per scroll frame.
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    document.documentElement.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [mobileOpen]);

  // Sliding hover highlight: moves to whichever link is under a real pointer.
  const moveIndicator = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const item = (e.target as HTMLElement).closest<HTMLElement>("[data-nav-item]");
    const track = trackRef.current;
    const ind = indicatorRef.current;
    if (!item || !track || !ind) return;
    const first = ind.style.opacity !== "1";
    // The first time in, appear in place instead of sliding from the last spot.
    ind.style.transition = first ? "opacity 150ms ease" : "";
    ind.style.width = `${item.offsetWidth}px`;
    ind.style.transform = `translateX(${item.offsetLeft}px)`;
    ind.style.opacity = "1";
  }, []);
  const hideIndicator = useCallback(() => {
    if (indicatorRef.current) indicatorRef.current.style.opacity = "0";
  }, []);

  const light = overlay && !scrolled && !mobileOpen;

  return (
    <header className={cn("fixed inset-x-0 top-0 z-40 transition-[padding] duration-300", scrolled ? "px-3 pt-2.5 sm:px-4" : "px-0 pt-0")}>
      <div
        className={cn(
          "relative mx-auto flex h-16 max-w-6xl items-center gap-6 border px-5 transition-[background-color,border-color,box-shadow,border-radius,height] duration-300 sm:px-6",
          scrolled
            ? "h-14 rounded-full border-line bg-canvas/80 shadow-[0_12px_36px_-18px_rgb(17_17_17/0.45)] backdrop-blur-xl backdrop-saturate-150"
            : overlay
              ? "rounded-none border-transparent bg-transparent"
              : "rounded-none border-transparent border-b-line bg-canvas",
        )}
        style={{ transitionTimingFunction: "var(--ease-out)" }}
      >
        <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="OpsWarden home">
          <LogoMark className="size-9 transition-transform duration-300 ease-out group-hover:rotate-[-6deg]" />
          <span className={cn("flex items-baseline text-[20px] leading-none transition-colors duration-300", light ? "text-[#F3EEE3]" : "text-ink")}>
            <span className="font-semibold tracking-tight">Ops</span>
            <span className="display italic">Warden</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 justify-center lg:flex">
          <div
            ref={trackRef}
            onPointerOver={moveIndicator}
            onPointerLeave={hideIndicator}
            className={cn(
              "relative flex items-center gap-0.5 rounded-full p-1 transition-colors duration-300",
              light ? "bg-white/[0.07] ring-1 ring-white/10" : scrolled ? "bg-transparent" : "bg-surface-muted/70",
            )}
          >
            <span
              ref={indicatorRef}
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-1 bottom-1 left-0 rounded-full opacity-0 transition-[transform,width,opacity] duration-300",
                light ? "bg-white/[0.14]" : "bg-surface shadow-[0_1px_3px_rgb(17_17_17/0.12)]",
              )}
              style={{ transitionTimingFunction: "var(--ease-out)" }}
            />
            {MAIN_NAV.map((entry) =>
              "items" in entry ? (
                <NavMenu key={entry.label} entry={entry} pathname={pathname} light={light} />
              ) : (
                <Link
                  key={entry.href}
                  href={entry.href}
                  data-nav-item
                  aria-current={isActive(pathname, entry.href) ? "page" : undefined}
                  className={cn(
                    "relative z-[1] whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors duration-150",
                    light ? "text-[#F3EEE3]/80 hover:text-[#F3EEE3]" : isActive(pathname, entry.href) ? "font-medium text-ink" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {entry.label}
                </Link>
              ),
            )}
          </div>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          <SignInLink light={light} />
          <LandingCta size="sm" signup className={scrolled ? "shadow-[0_6px_16px_-6px_rgb(238_106_36/0.6)]" : undefined} />
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className={cn(
              "btn grid size-9 place-items-center rounded-full border lg:hidden",
              light ? "border-white/20 bg-white/10 text-[#F3EEE3]" : "border-line bg-surface text-ink",
            )}
          >
            {mobileOpen ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
          </button>
        </div>

        {/* Reading progress */}
        <span aria-hidden className={cn("pointer-events-none absolute inset-x-6 bottom-0 h-[2px] overflow-hidden rounded-full", scrolled ? "opacity-100" : "opacity-0")}>
          <span ref={progressRef} className="block h-full w-full origin-left bg-brand" style={{ transform: "scaleX(0)" }} />
        </span>
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
