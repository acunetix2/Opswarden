import { Check } from "lucide-react";

import { CASE_STEPS, evaluateProgress, type ProgressInput } from "@/lib/case-progress";
import { cn } from "@/lib/cn";

/** Shows where a case is in its lifecycle and what to do next. */
export function CaseProgress(props: ProgressInput) {
  const { done, current, next } = evaluateProgress(props);
  return (
    <section aria-label="Case progress" className="overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_1px_2px_rgb(17_17_17/0.04)] print:hidden">
      <ol className="grid grid-cols-2 divide-line sm:grid-cols-5 sm:divide-x">
        {CASE_STEPS.map((label, i) => {
          const isDone = done[i];
          const isCurrent = i === current;
          return (
            <li
              key={label}
              aria-current={isCurrent ? "step" : undefined}
              className={cn("flex items-center gap-2.5 px-4 py-3", isCurrent && "bg-brand-tint")}
            >
              <span
                aria-hidden
                className={cn(
                  "figure flex size-6 shrink-0 items-center justify-center border text-[12px]",
                  isDone
                    ? "border-success bg-success text-surface"
                    : isCurrent
                      ? "border-brand-ink text-brand-ink"
                      : "border-line-strong text-ink-3",
                )}
              >
                {isDone ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("text-[13px] leading-tight", isCurrent ? "font-medium text-ink" : isDone ? "text-ink-2" : "text-ink-3")}>
                {label}
                <span className="sr-only">{isDone ? " (done)" : isCurrent ? " (current step)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-line px-4 py-2.5 text-[13px] text-ink-2">
        <span className="label mr-2 text-brand-ink">Next</span>
        {next}
      </p>
    </section>
  );
}
