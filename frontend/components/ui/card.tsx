import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Orange folded corner, used for cards that need the user's attention. */
  flagged?: boolean;
  /** Lift on hover, for cards that are themselves links or buttons. */
  interactive?: boolean;
}

/**
 * A filed sheet: paper surface, hairline frame and a soft offset "stack"
 * shadow so cards read as separate records on the canvas.
 */
export function Card({ className, flagged, interactive, children, ...rest }: CardProps) {
  return (
    <section
      className={cn(
        "relative rounded-[12px] border border-line bg-surface shadow-[0_1px_2px_rgb(17_17_17/0.04)]",
        interactive &&
          "transition-[translate,box-shadow,border-color] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_6px_18px_rgb(17_17_17/0.07)]",
        className,
      )}
      {...rest}
    >
      {flagged ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-px -right-px size-5 rounded-tr-[12px] bg-[linear-gradient(225deg,var(--color-brand)_50%,transparent_50%)]"
        />
      ) : null}
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Short index shown as a tab before the title, e.g. "01". */
  index?: string;
  /** Icon shown in a square tile before the title. */
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  as?: "h2" | "h3";
}

export function CardHeader({ title, description, index, icon, action, className, as: Heading = "h2" }: CardHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-3.5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[8px] bg-surface-muted text-ink-2 [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <Heading className="flex items-center gap-2.5 text-[14.5px] font-semibold leading-6 text-ink">
            {index ? (
              <span className="inline-flex h-5 items-center rounded-[5px] bg-surface-muted px-1.5 font-mono text-[10.5px] font-medium text-ink-3">
                {index}
              </span>
            ) : null}
            {title}
          </Heading>
          {description ? <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 rounded-b-[12px] border-t border-line bg-canvas/60 px-5 py-3", className)} {...rest} />;
}

/** Section divider for pages: index tab, title, full-width hairline. */
export function SectionRule({ index, title, action, id }: { index?: string; title: string; action?: ReactNode; id?: string }) {
  return (
    <div className="flex items-center gap-3">
      {index ? (
        <span className="inline-flex h-5 items-center rounded-[3px] bg-ink px-1.5 font-mono text-[10.5px] font-medium text-canvas">{index}</span>
      ) : null}
      <h2 id={id} className="shrink-0 text-[14.5px] font-semibold text-ink">{title}</h2>
      <span aria-hidden className="h-px flex-1 bg-line-strong" />
      {action}
    </div>
  );
}
