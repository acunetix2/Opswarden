import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/states";
import { cn } from "@/lib/cn";

interface MetricCellProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
  /** Marks a card that needs attention with an orange dot and tinted border. */
  attention?: boolean;
}

const card = "relative flex flex-col rounded-[12px] border bg-surface px-5 py-4 shadow-[0_1px_2px_rgb(17_17_17/0.04)]";

/** One stand-alone metric card: label, large figure, one line of context. */
export function MetricCell({ label, value, detail, href, attention }: MetricCellProps) {
  const body = (
    <>
      <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink-3">
        {attention ? <span aria-hidden className="size-2 rounded-full bg-brand" /> : null}
        {label}
        {attention ? <span className="sr-only"> (needs attention)</span> : null}
      </p>
      <p className="mt-2.5 text-[30px] font-semibold leading-none tracking-tight text-ink tabular">{value}</p>
      {detail ? <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-3">{detail}</p> : null}
    </>
  );
  const tone = attention ? "border-brand/35" : "border-line";
  return href ? (
    <Link
      href={href}
      className={cn(
        card,
        tone,
        "group transition-[translate,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_8px_22px_rgb(17_17_17/0.08)]",
      )}
    >
      {body}
      <ArrowUpRight aria-hidden className="absolute right-4 top-4 size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  ) : (
    <div className={cn(card, tone)}>{body}</div>
  );
}

/** Row of separate metric cards with even gaps. */
export function MetricStrip({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{children}</div>;
}

export function MetricCellSkeleton() {
  return (
    <div className={cn(card, "border-line")}>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-8 w-24" />
      <Skeleton className="mt-4 h-4 w-48" />
    </div>
  );
}
