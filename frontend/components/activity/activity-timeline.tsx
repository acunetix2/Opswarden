import Link from "next/link";

import { cn } from "@/lib/cn";
import { eventDetail, eventLabel, formatDateTime, parseDate, relativeTime } from "@/lib/format";
import type { ActivityEvent, ActorType } from "@/lib/types";

const ACTOR: Record<ActorType, { code: string; label: string; tone: string }> = {
  user: { code: "USR", label: "Person", tone: "bg-ink text-canvas" },
  system: { code: "SYS", label: "System", tone: "border border-line-strong text-ink-2" },
  agent: { code: "AI", label: "AI agent", tone: "bg-brand text-ink" },
  integration: { code: "INT", label: "Integration", tone: "border border-info/50 text-info" },
};

function actorName(e: ActivityEvent): string {
  if (e.actor_type === "user") return e.actor_name ?? "A user";
  return ACTOR[e.actor_type]?.label ?? e.actor_type;
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(parseDate(iso));
}

interface ActivityTimelineProps {
  events: ActivityEvent[];
  /** Show which case each event belongs to (workspace-wide log). */
  showCase?: boolean;
  compact?: boolean;
}

/**
 * The audit trail as a ledger: time, actor code, entry. Shows decisions and
 * evidence, never model reasoning. People, system, and AI are visibly distinct.
 */
export function ActivityTimeline({ events, showCase = false, compact = false }: ActivityTimelineProps) {
  return (
    <ol className="divide-y divide-line border-y border-line">
      {events.map((e) => {
        const actor = ACTOR[e.actor_type] ?? ACTOR.system;
        const detail = eventDetail(e);
        return (
          <li key={e.id} className={cn("grid gap-3 py-2.5", compact ? "grid-cols-[3.25rem_1fr]" : "grid-cols-[4.5rem_2.75rem_1fr]")}>
            <time dateTime={e.created_at} title={formatDateTime(e.created_at)} className="pt-0.5 font-mono text-[11px] text-ink-3">
              {compact ? relativeTime(e.created_at).replace(/ ago$/, "") : clock(e.created_at)}
            </time>
            {!compact ? (
              <span className={cn("h-5 w-fit rounded-sm px-1 pt-px font-mono text-[10px] leading-[18px]", actor.tone)} title={actor.label}>
                {actor.code}
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="text-[13px] leading-snug text-ink">
                {compact ? (
                  <span className={cn("mr-1.5 inline-block rounded-sm px-1 align-[1px] font-mono text-[9.5px] leading-4", actor.tone)} title={actor.label}>
                    {actor.code}
                  </span>
                ) : null}
                <span className="font-medium">{eventLabel(e.event_type)}</span>
                <span className="text-ink-3"> · {actorName(e)}</span>
                {e.actor_type !== "user" ? <span className="sr-only"> ({actor.label})</span> : null}
              </p>
              {detail ? <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{detail}</p> : null}
              {showCase && e.case_id && e.case_number ? (
                <Link href={`/app/investigations/${e.case_id}`} className="mt-0.5 inline-block font-mono text-[11px] text-brand-ink hover:underline">
                  {e.case_number}
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
