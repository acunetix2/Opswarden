import { Card } from "@/components/ui/card";
import { SpeakButton } from "@/components/ui/speak-button";
import { Skeleton } from "@/components/ui/states";
import { formatMoneyValue } from "@/lib/format";
import type { CaseSummary, Severity } from "@/lib/types";

const ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

/**
 * Two clearly separated blocks: what the records show (facts, deterministic) and
 * what policy suggests next (recommendation). Suggestions never read as findings.
 */
export function ExecutiveSummary({ summary, canListen = false }: { summary: CaseSummary | undefined; canListen?: boolean }) {
  if (!summary) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-16 w-full" />
      </Card>
    );
  }

  const [intro, ...rest] = summary.summary.split("\n");
  const bullets = rest.filter((l) => l.startsWith("- ")).map((l) => l.slice(2).replace(/^\[[A-Z]+\]\s*/, ""));
  const tally = ORDER.filter((s) => summary.by_severity[s]).map((s) => `${summary.by_severity[s]} ${s}`);

  return (
    <Card className="overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="facts-h" className="px-6 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="facts-h" className="text-[12.5px] font-semibold text-ink">What the records show</h2>
            {tally.length ? <span className="font-mono text-[11px] text-ink-3">{tally.join(" · ")}</span> : null}
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-ink">{intro}</p>
          {bullets.length ? (
            <ol className="mt-3 space-y-2">
              {bullets.map((b, i) => (
                <li key={b} className="grid grid-cols-[1.75rem_1fr] text-[13.5px] leading-relaxed text-ink-2">
                  <span className="figure text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <span>{b}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <p className="mt-4 text-[12px] text-ink-3">Derived only from deterministic comparison of the uploaded records.</p>
        </section>

        <section aria-labelledby="next-h" className="border-t border-line bg-brand-tint/50 px-6 py-5 text-ink lg:border-t-0 lg:border-l">
          {canListen ? (
            <SpeakButton
              text={`${summary.summary.replace(/\[[A-Z]+\]\s*/g, "")}\nRecommended next step: ${summary.recommended_next_step}`}
              label="Listen to summary"
              className="mb-4"
            />
          ) : null}
          <h2 id="next-h" className="text-[12.5px] font-semibold text-brand-ink">Recommended next step</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed">{summary.recommended_next_step}</p>
          <p className="mt-2 text-[12px] leading-snug text-ink-3">
            Suggested from workspace policy. It doesn&apos;t withhold payment or change records on its own.
          </p>
          {summary.exposure.length ? (
            <div className="mt-4 border-t border-brand/20 pt-3">
              <p className="text-[12px] font-medium text-ink-3">Estimated value in dispute</p>
              <p className="mt-1 text-[24px] font-semibold leading-none tracking-tight text-ink tabular">{summary.exposure.map((m) => formatMoneyValue(m)).join(" + ")}</p>
            </div>
          ) : null}
        </section>
      </div>
    </Card>
  );
}
