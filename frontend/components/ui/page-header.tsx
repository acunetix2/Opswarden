import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Optional row under the title, e.g. status pill tabs. */
  tabs?: ReactNode;
  className?: string;
}

/** Compact page title block: title, one-line description, actions on the right, optional tabs below. */
export function PageHeader({ title, description, eyebrow, actions, tabs, className }: PageHeaderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="mb-1 text-[12px] font-medium text-ink-3">{eyebrow}</div> : null}
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[26px]">{title}</h1>
          {description ? <div className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-ink-3">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs ? <div>{tabs}</div> : null}
    </div>
  );
}
