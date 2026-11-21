"use client";

import { Check, Pencil, X } from "lucide-react";
import { Fragment, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { toAppError } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { fieldMatches } from "@/lib/findings";
import { humanize, humanizeFieldPath } from "@/lib/format";
import type { ExtractedField } from "@/lib/types";
import { useCorrectFieldsMutation } from "@/store/api";
import { useToast } from "@/store/hooks";

/** Ten-tick meter plus the number, so confidence reads at a glance without color alone. */
function ConfidenceLabel({ value }: { value: number | null }) {
  if (value === null) return <span className="font-mono text-[11px] text-ink-3">—</span>;
  const pct = Math.round(value * 100);
  const high = value >= 0.6;
  const ticks = Math.round(value * 10);
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="flex gap-px">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={cn("h-3 w-[3px]", i < ticks ? (high ? "bg-ink" : "bg-warning") : "bg-line")} />
        ))}
      </span>
      <span className={cn("font-mono text-[11px]", high ? "text-ink-2" : "text-warning")}>
        {pct}%<span className="sr-only">{high ? " high" : " low"} confidence</span>
      </span>
    </span>
  );
}

function ReviewBadge({ status }: { status: string }) {
  if (status === "corrected") return <Badge tone="info">Corrected</Badge>;
  if (status === "verified") return <Badge tone="success">Verified</Badge>;
  if (status === "needs_review") return <Badge tone="warning">Check this</Badge>;
  return <Badge tone="neutral">Auto</Badge>;
}

function groupKey(path: string): string {
  const m = /^line_items\[(\d+)\]/.exec(path);
  return m ? `Line ${Number(m[1]) + 1}` : "Document details";
}

function fieldName(path: string): string {
  const m = /^line_items\[\d+\]\.(.+)$/.exec(path);
  return humanize(m ? (m[1] ?? path) : path);
}

interface ExtractionReviewProps {
  documentId: string;
  caseId: string;
  fields: ExtractedField[];
  highlight: string | null;
  canCorrect: boolean;
  onCorrected: () => void;
  /** Show only low-confidence fields that still need a person. */
  onlyNeedsReview?: boolean;
}

/** Extracted values with confidence and inline, audited corrections (EXT-02/04/05). */
export function ExtractionReview({ documentId, caseId, fields: allFields, highlight, canCorrect, onCorrected, onlyNeedsReview }: ExtractionReviewProps) {
  const fields = onlyNeedsReview ? allFields.filter((f) => f.review_status === "needs_review") : allFields;
  const toast = useToast();
  const [correct, { isLoading }] = useCorrectFieldsMutation();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  const groups = new Map<string, ExtractedField[]>();
  for (const f of [...fields].sort((a, b) => a.field_path.localeCompare(b.field_path, undefined, { numeric: true }))) {
    const k = groupKey(f.field_path);
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }

  async function save(path: string) {
    try {
      await correct({ documentId, caseId, corrections: [{ field_path: path, value: value.trim(), reason: reason.trim() || null }] }).unwrap();
      toast("success", "Field corrected", "The original value is kept in the audit trail.");
      setEditing(null);
      onCorrected();
    } catch (err) {
      toast("danger", "Couldn't save the correction", toAppError(err).message);
    }
  }

  /** Confirms the extracted value as-is (recorded as a verification). */
  async function verify(f: ExtractedField) {
    try {
      await correct({ documentId, caseId, corrections: [{ field_path: f.field_path, value: f.value, reason: "Verified against the source document" }] }).unwrap();
      toast("success", "Value confirmed");
      onCorrected();
    } catch (err) {
      toast("danger", "Couldn't confirm the value", toAppError(err).message);
    }
  }

  if (fields.length === 0) {
    return (
      <p className="px-5 py-6 text-[13px] text-ink-3">
        <span className="mr-2 font-mono">—</span>Nothing left to check in this document.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <caption className="sr-only">Extracted fields</caption>
        <thead>
          <tr className="border-b border-line bg-canvas/60">
            <th scope="col" className="label px-5 py-2.5 text-left font-medium">Field</th>
            <th scope="col" className="label px-3 py-2.5 text-left font-medium">Value read</th>
            <th scope="col" className="label px-3 py-2.5 text-left font-medium">
              <abbr title="How reliably the value was read from the document, not whether it is correct" className="no-underline">
                Read confidence
              </abbr>
            </th>
            <th scope="col" className="label px-3 py-2.5 text-left font-medium">State</th>
            <th scope="col" className="px-5 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {[...groups.entries()].map(([group, rows]) => (
            <Fragment key={group}>
              <tr>
                <th colSpan={5} scope="colgroup" className="label border-b border-line bg-surface-muted/50 px-5 pt-3 pb-1.5 text-left text-ink">
                  {group}
                </th>
              </tr>
              {rows.map((f) => {
                const hit = highlight ? fieldMatches(highlight, f.field_path) : false;
                const isEditing = editing === f.field_path;
                return (
                  <tr key={f.id} className={cn("relative border-b border-line", hit && "bg-brand-tint")} aria-current={hit ? "true" : undefined}>
                    <th scope="row" className="relative px-5 py-2.5 text-left font-normal">
                      {hit ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-brand" /> : null}
                      <span className="text-ink-2">{fieldName(f.field_path)}</span>
                      {hit ? <span className="label mt-0.5 block text-brand-ink">Cited by the finding</span> : null}
                    </th>
                    <td className="px-3 py-2.5">
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <label className="sr-only" htmlFor={`v-${f.id}`}>Corrected value for {humanizeFieldPath(f.field_path)}</label>
                          <Input id={`v-${f.id}`} value={value} onChange={(e) => setValue(e.target.value)} className="h-8" autoFocus />
                          <label className="sr-only" htmlFor={`r-${f.id}`}>Reason</label>
                          <Input id={`r-${f.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. checked against page 1)" className="h-8 text-xs" />
                        </div>
                      ) : (
                        <span className="figure text-[13.5px] text-ink">{f.value || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5"><ConfidenceLabel value={f.confidence} /></td>
                    <td className="px-3 py-2.5"><ReviewBadge status={f.review_status} /></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {canCorrect ? (
                        isEditing ? (
                          <span className="inline-flex gap-1">
                            <Button size="sm" loading={isLoading} disabled={!value.trim() || value.trim() === f.value} onClick={() => save(f.field_path)} icon={<Check className="size-3.5" aria-hidden />}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel correction">
                              <X className="size-3.5" aria-hidden />
                            </Button>
                          </span>
                        ) : (
                          <span className="inline-flex gap-1">
                          {f.review_status === "needs_review" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={isLoading}
                              icon={<Check className="size-3.5" aria-hidden />}
                              onClick={() => verify(f)}
                              aria-label={`Confirm ${humanizeFieldPath(f.field_path)} is correct`}
                            >
                              Confirm
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Pencil className="size-3.5" aria-hidden />}
                            onClick={() => {
                              setEditing(f.field_path);
                              setValue(f.value);
                              setReason("");
                            }}
                            aria-label={`Correct ${humanizeFieldPath(f.field_path)}`}
                          >
                            Correct
                          </Button>
                          </span>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
