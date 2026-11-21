"use client";

import { LogoMark } from "@/components/layout/logo";
import { cn } from "@/lib/cn";

/**
 * Warden, the assistant: the OpsWarden logo with motion. The logo floats
 * gently, a soft orange halo breathes behind it and a spark orbits it. All
 * motion is CSS (globals.css) and stops under prefers-reduced-motion.
 * `tone` is accepted for compatibility; the logo is full colour on any background.
 */
export function WardenIcon({ className, animated = true }: { className?: string; animated?: boolean; tone?: "light" | "dark" }) {
  return (
    <span aria-hidden className={cn("relative inline-grid size-10 shrink-0 place-items-center", className)}>
      {animated ? <span className="ow-halo pointer-events-none absolute inset-[6%] rounded-full" /> : null}
      <LogoMark className={cn("relative size-full", animated && "ow-float")} />
      {animated ? (
        <span className="ow-orbit-html pointer-events-none absolute inset-[-4%]">
          <span className="absolute top-0 left-1/2 size-[12%] min-h-1 min-w-1 -translate-x-1/2 rounded-full bg-[#ee6a24] shadow-[0_0_6px_2px_rgb(238_106_36/0.55)]" />
        </span>
      ) : null}
    </span>
  );
}
