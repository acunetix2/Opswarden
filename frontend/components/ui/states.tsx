import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/layout/logo";
import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";

import { Button } from "./button";

interface EmptyStateProps {
  /** Accepted for API compatibility; empty states are typographic. */
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Left-aligned, written like a ledger entry: a dash, a sentence, a next step. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("px-5 py-8", className)}>
      <p className="flex items-baseline gap-3 text-[14px] font-medium text-ink">
        <span aria-hidden className="font-mono text-ink-3">—</span>
        {title}
      </p>
      {description ? <p className="mt-1 max-w-md pl-7 text-[13px] leading-relaxed text-ink-3">{description}</p> : null}
      {action ? <div className="mt-4 pl-7">{action}</div> : null}
    </div>
  );
}

/** Renders any API error (permission, not found, network) with a retry where useful. */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const e = toAppError(error);
  const title = e.status === 403 ? "You don't have access to this" : e.status === 404 ? "Not found" : "This didn't load";
  return (
    <div role={e.status === 403 ? undefined : "alert"} className={cn("flex items-start gap-4 px-5 py-6", className)}>
      <LogoMark className="size-12 shrink-0" />
      <div className="min-w-0">
        <p className={cn("text-[12.5px] font-medium", e.status === 403 ? "text-warning" : "text-danger")}>
          {e.status === 403 ? "Restricted" : e.status ? `Error ${e.status}` : "Offline"}
        </p>
        <p className="mt-0.5 text-[15px] font-semibold text-ink">{title}</p>
        <p className="mt-1 max-w-md text-[13px] text-ink-2">{e.message}</p>
        {e.requestId ? <p className="mt-2 font-mono text-[11px] text-ink-3">ref {e.requestId}</p> : null}
        {onRetry && e.status !== 404 && e.status !== 403 ? (
          <Button variant="secondary" size="sm" className="mt-4" icon={<RefreshCw className="size-3.5" aria-hidden />} onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[8px] bg-surface-sunken/70", className)} />;
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-line", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="py-3">
          <Skeleton className="h-4" />
        </div>
      ))}
    </div>
  );
}
