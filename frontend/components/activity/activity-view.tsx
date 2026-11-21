"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { formatDate, parseDate } from "@/lib/format";
import type { ActorType } from "@/lib/types";
import { useWorkspaceActivityQuery } from "@/store/api";
import { useWorkspace } from "@/store/hooks";

import { ActivityTimeline } from "./activity-timeline";

const CATEGORIES: Record<string, { label: string; prefixes: string[] }> = {
  cases: { label: "Cases", prefixes: ["case."] },
  documents: { label: "Documents & extraction", prefixes: ["document.", "field."] },
  analysis: { label: "Comparison & findings", prefixes: ["comparison.", "investigation.", "finding.", "analysis."] },
  actions: { label: "Recommendations & approvals", prefixes: ["recommendation.", "approval.", "action."] },
  access: { label: "Team, access & settings", prefixes: ["member.", "user.", "workspace."] },
};

export function ActivityView() {
  const { workspace, role } = useWorkspace();
  const isAdmin = role === "admin";
  const { data, error, isLoading, refetch } = useWorkspaceActivityQuery(workspace.id, { skip: !isAdmin });
  const [category, setCategory] = useState("");
  const [actor, setActor] = useState<"" | ActorType>("");

  const groups = useMemo(() => {
    const prefixes = category ? CATEGORIES[category]?.prefixes ?? [] : [];
    const filtered = (data ?? []).filter(
      (e) => (!prefixes.length || prefixes.some((p) => e.event_type.startsWith(p))) && (!actor || e.actor_type === actor),
    );
    const byDay = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const day = parseDate(e.created_at).toDateString();
      byDay.set(day, [...(byDay.get(day) ?? []), e]);
    }
    return [...byDay.entries()];
  }, [data, category, actor]);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Audit" title="Activity log" description="Workspace-wide record of who did what, and when. Newest first. Entries can't be edited." />
      {!isAdmin ? (
        <Card>
          <EmptyState title="Workspace activity is for administrators" description="You can see the full history of any case from its audit trail panel." />
        </Card>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside aria-label="Filters" className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <div>
              <label htmlFor="act-cat" className="label">Category</label>
              <Select id="act-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 h-9 text-[13px]">
                <option value="">All entries</option>
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="act-actor" className="label">Actor</label>
              <Select id="act-actor" value={actor} onChange={(e) => setActor(e.target.value as "" | ActorType)} className="mt-1 h-9 text-[13px]">
                <option value="">Everyone</option>
                <option value="user">People</option>
                <option value="system">System</option>
                <option value="agent">AI agent</option>
                <option value="integration">Integrations</option>
              </Select>
            </div>
            <dl className="space-y-1.5 border-t border-line pt-4 text-[12px] text-ink-3">
              <p className="label mb-2">Key</p>
              {[["USR", "A person", "bg-ink text-canvas"], ["AI", "AI agent", "bg-brand text-ink"], ["SYS", "System", "border border-line-strong text-ink-2"], ["INT", "Integration", "border border-info/50 text-info"]].map(([c, l, cls]) => (
                <div key={c} className="flex items-center gap-2">
                  <dt className={`w-9 rounded-sm text-center font-mono text-[10px] leading-[18px] ${cls}`}>{c}</dt>
                  <dd>{l}</dd>
                </div>
              ))}
            </dl>
          </aside>

          <div aria-live="polite">
            {isLoading ? (
              <SkeletonRows rows={8} />
            ) : error && !data ? (
              <ErrorState error={error} onRetry={refetch} />
            ) : groups.length === 0 ? (
              <EmptyState title="No matching entries" className="px-0" />
            ) : (
              <div className="space-y-8">
                {groups.map(([day, events]) => (
                  <section key={day} aria-label={formatDate(events[0]!.created_at)}>
                    <h2 className="mb-2 flex items-baseline gap-3">
                      <span className="display text-[24px] text-ink">{formatDate(events[0]!.created_at)}</span>
                      <span className="font-mono text-[11px] text-ink-3">{events.length} entries</span>
                    </h2>
                    <ActivityTimeline events={events} showCase />
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
