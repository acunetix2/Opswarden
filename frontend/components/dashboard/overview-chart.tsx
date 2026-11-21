"use client";

import { useMemo, useState, type PointerEvent } from "react";

import { formatShortDate } from "@/lib/format";
import type { SeriesPoint } from "@/lib/types";
import { useElementWidth } from "@/lib/use-element-width";

const HEIGHT = 220;
const PAD = { top: 10, right: 4, bottom: 26, left: 28 };

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/**
 * Daily tally: an ink bar for cases opened, an orange bar for cases resolved.
 * Countable bars, not a smoothed curve: every column is one real day.
 */
export function OverviewChart({ series }: { series: SeriesPoint[] }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const innerW = Math.max(width - PAD.left - PAD.right, 1);
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const maxY = niceMax(Math.max(...series.flatMap((p) => [p.created, p.resolved]), 0));
    const slot = innerW / Math.max(series.length, 1);
    const bar = Math.max(Math.min(slot * 0.32, 10), 1.5);
    const x = (i: number) => PAD.left + i * slot + slot / 2;
    const h = (v: number) => (v / maxY) * innerH;
    const baseline = PAD.top + innerH;
    const ticks = [0, 0.5, 1].map((t) => Math.round(maxY * t));
    const labelEvery = Math.max(1, Math.ceil(series.length / 6));
    return { innerH, maxY, slot, bar, x, h, baseline, ticks, labelEvery };
  }, [series, width]);

  const totals = series.reduce((a, p) => ({ created: a.created + p.created, resolved: a.resolved + p.resolved }), { created: 0, resolved: 0 });

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - PAD.left) / geo.slot);
    setHover(i >= 0 && i < series.length ? i : null);
  }

  const hp = hover !== null ? series[hover] : undefined;

  return (
    <figure className="m-0">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1" aria-hidden>
        <span className="flex items-baseline gap-2">
          <span className="size-2.5 translate-y-px bg-ink" />
          <span className="label">Opened</span>
          <span className="figure text-[15px] text-ink">{totals.created}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="size-2.5 translate-y-px bg-brand" />
          <span className="label">Resolved</span>
          <span className="figure text-[15px] text-ink">{totals.resolved}</span>
        </span>
        <span className="ml-auto font-mono text-[11px] text-ink-3">
          {hp ? `${formatShortDate(hp.date)} · ${hp.created} opened · ${hp.resolved} resolved` : "Hover a day for its tally"}
        </span>
      </div>
      <div ref={ref} className="w-full" style={{ height: HEIGHT }}>
        {width > 0 ? (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Over the last ${series.length} days, ${totals.created} cases were opened and ${totals.resolved} were resolved.`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {geo.ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={geo.baseline - geo.h(t)} y2={geo.baseline - geo.h(t)} stroke={t === 0 ? "#111111" : "#D9D0BF"} strokeWidth={t === 0 ? 1 : 1} strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={PAD.left - 8} y={geo.baseline - geo.h(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 font-mono text-[10px]">
                  {t}
                </text>
              </g>
            ))}

            {series.map((p, i) => {
              const cx = geo.x(i);
              const active = hover === i;
              return (
                <g key={p.date} opacity={hover === null || active ? 1 : 0.35}>
                  {active ? <rect x={cx - geo.slot / 2} y={PAD.top} width={geo.slot} height={geo.innerH} fill="#ECE5D6" /> : null}
                  <rect x={cx - geo.bar - 0.5} y={geo.baseline - geo.h(p.created)} width={geo.bar} height={geo.h(p.created)} fill="#111111" />
                  <rect x={cx + 0.5} y={geo.baseline - geo.h(p.resolved)} width={geo.bar} height={geo.h(p.resolved)} fill="#D9541E" />
                </g>
              );
            })}

            {series.map((p, i) =>
              i % geo.labelEvery === 0 ? (
                <text key={`l-${p.date}`} x={geo.x(i)} y={HEIGHT - 6} textAnchor="middle" className="fill-ink-3 font-mono text-[10px] uppercase">
                  {formatShortDate(p.date)}
                </text>
              ) : null,
            )}
          </svg>
        ) : null}
      </div>
      <figcaption className="sr-only">
        Daily cases opened and resolved. Totals: {totals.created} opened, {totals.resolved} resolved.
      </figcaption>
    </figure>
  );
}
