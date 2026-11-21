import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, { text: string; bg: string; border: string; dot: string }> = {
  neutral: { text: "text-ink-2", bg: "bg-surface-muted", border: "border-line-strong", dot: "bg-ink-3" },
  brand: { text: "text-brand-ink", bg: "bg-brand-tint", border: "border-brand/45", dot: "bg-brand" },
  success: { text: "text-success", bg: "bg-success-soft", border: "border-success/35", dot: "bg-success" },
  warning: { text: "text-warning", bg: "bg-warning-soft", border: "border-warning/40", dot: "bg-warning" },
  danger: { text: "text-danger", bg: "bg-danger-soft", border: "border-danger/35", dot: "bg-danger" },
  info: { text: "text-info", bg: "bg-info-soft", border: "border-info/35", dot: "bg-info" },
};

interface BadgeProps {
  tone?: Tone;
  /** Small icon shown before the text. Replaces the dot. */
  icon?: ReactNode;
  /** Pulsing dot for live states such as "Processing". */
  live?: boolean;
  /** "soft" (tinted fill, default) or "outline" (frame only, for dense tables). */
  variant?: "soft" | "outline";
  children: ReactNode;
  className?: string;
}

/**
 * Status stamp: tinted fill, hairline frame, tone dot or icon. The text always
 * carries the meaning, so colour is never the only signal.
 */
export function Badge({ tone = "neutral", icon, live, variant = "soft", children, className }: BadgeProps) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-2 text-[11px] font-medium leading-none tracking-[0.01em]",
        t.text,
        t.border,
        variant === "soft" ? t.bg : "bg-transparent",
        "[&_svg]:size-3 [&_svg]:shrink-0",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className="inline-flex">{icon}</span>
      ) : (
        <span aria-hidden className="relative inline-flex size-1.5 shrink-0">
          {live ? <span className={cn("absolute inset-0 animate-ping rounded-full opacity-70", t.dot)} /> : null}
          <span className={cn("relative size-1.5 rounded-full", t.dot)} />
        </span>
      )}
      {children}
    </span>
  );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1.5 font-mono text-[10.5px] font-semibold leading-none text-on-brand tabular",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
