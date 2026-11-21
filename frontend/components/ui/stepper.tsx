import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

interface StepperProps {
  steps: string[];
  /** 1-based current step. */
  current: number;
}

/** Numbered steps in a rounded card; done steps get a tick, the current one an orange ring. */
export function Stepper({ steps, current }: StepperProps) {
  return (
    <nav aria-label="Progress">
      <ol
        className="grid overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_1px_2px_rgb(17_17_17/0.04)]"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={cn("flex items-center gap-3 border-l border-line px-4 py-3 first:border-l-0", active && "bg-brand-tint/60")}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                  done && "bg-success text-canvas",
                  active && "bg-brand text-on-brand ring-4 ring-brand-tint",
                  !done && !active && "bg-surface-sunken text-ink-3",
                )}
              >
                {done ? <Check className="size-3.5" /> : n}
              </span>
              <span className={cn("min-w-0 truncate text-[13px] font-medium", active || done ? "text-ink" : "text-ink-3")}>
                {label}
                <span className="sr-only">{done ? " (completed)" : active ? " (current)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
