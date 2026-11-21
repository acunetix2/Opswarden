import type { ActivityEvent, CaseStatus, DocumentType, Money } from "./types";

/**
 * Display formatting only. Values arrive as decimal strings from the API and
 * are converted to numbers solely for Intl formatting, never for arithmetic.
 */
export function formatMoney(amount: string | null | undefined, currency: string, opts: { compact?: boolean } = {}): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${currency} ${amount}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: opts.compact && Math.abs(value) >= 10_000 ? "compact" : "standard",
      maximumFractionDigits: opts.compact && Math.abs(value) >= 10_000 ? 1 : 2,
      minimumFractionDigits: opts.compact && Math.abs(value) >= 10_000 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function formatMoneyValue(money: Money | null | undefined, opts?: { compact?: boolean }): string {
  return money ? formatMoney(money.amount, money.currency, opts) : "—";
}

export function formatQuantity(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat().format(n) : value;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(parseDate(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parseDate(iso));
}

export function formatShortDate(isoDay: string): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(`${isoDay}T00:00:00`));
}

/** The backend may return naive UTC timestamps (SQLite); treat them as UTC. */
export function parseDate(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = (parseDate(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(iso);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  purchase_order: "Purchase order",
  invoice: "Supplier invoice",
  delivery_receipt: "Delivery receipt",
};

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  draft: "Draft",
  processing: "Processing",
  needs_review: "Needs review",
  ready_for_approval: "Ready for approval",
  in_progress: "In progress",
  resolved: "Resolved",
  failed: "Processing failed",
  archived: "Archived",
};

/** Turns `line_items[0].unit_price` into `Line 1 · Unit price`. */
export function humanizeFieldPath(path: string | null | undefined): string {
  if (!path) return "Document";
  const m = /^line_items(?:\[(\d+)\])?\.(.+)$/.exec(path);
  if (m) {
    const field = sentence(m[2] ?? "");
    return m[1] !== undefined ? `Line ${Number(m[1]) + 1} · ${field}` : `Line items · ${field}`;
  }
  return sentence(path);
}

function sentence(snake: string): string {
  const s = snake.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const humanize = sentence;

const EVENT_LABEL: Record<string, string> = {
  "case.created": "Case created",
  "case.updated": "Case details updated",
  "case.status_changed": "Status changed",
  "case.resolved": "Case resolved",
  "document.uploaded": "Document uploaded",
  "document.deleted": "Document removed",
  "document.extraction.started": "Extraction started",
  "document.extraction.completed": "Extraction completed",
  "document.extraction.failed": "Extraction failed",
  "field.corrected": "Extracted field corrected",
  "comparison.started": "Comparison started",
  "comparison.completed": "Comparison completed",
  "investigation.completed": "Investigation completed",
  "finding.reviewed": "Finding reviewed",
  "recommendation.generated": "Supplier email drafted",
  "approval.requested": "Approval requested",
  "approval.decided": "Approval decided",
  "action.executed": "Action executed",
  "action.exported": "Draft exported for manual sending",
  "action.failed": "Action failed",
  "analysis.failed": "Analysis stopped",
  "case.archived": "Case archived",
  "case.reopened": "Case reopened",
  "field.verified": "Extracted field verified",
  "member.invited": "Teammate invited",
  "member.invitation_revoked": "Invitation revoked",
  "member.joined": "Teammate joined",
  "member.role_changed": "Member role changed",
  "member.removed": "Member removed",
  "member.reset_link_issued": "Password reset link issued",
  "user.password_reset": "Password reset",
  "workspace.settings_updated": "Workspace settings changed",
};

export function eventLabel(eventType: string): string {
  return EVENT_LABEL[eventType] ?? sentence(eventType.replace(/\./g, " "));
}

/** Short, non-sensitive detail line for an audit event. */
export function eventDetail(event: ActivityEvent): string | null {
  const p = event.payload ?? {};
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : undefined);
  switch (event.event_type) {
    case "case.created":
      return str("case_number") ?? null;
    case "case.status_changed": {
      const from = str("from") as CaseStatus | undefined;
      const to = str("to") as CaseStatus | undefined;
      return from && to ? `${CASE_STATUS_LABEL[from] ?? from} → ${CASE_STATUS_LABEL[to] ?? to}` : null;
    }
    case "case.resolved":
      return str("comment") ?? null;
    case "case.archived":
    case "case.reopened":
      return str("reason") ?? null;
    case "analysis.failed":
      return str("reason") ?? null;
    case "member.invited":
      return [str("email"), str("role") && sentence(str("role")!)].filter(Boolean).join(" · ");
    case "member.invitation_revoked":
      return str("email") ?? null;
    case "member.joined":
      return str("role") ? `As ${str("role")}` : null;
    case "member.role_changed":
      return str("member") ? `${str("member")}: ${sentence(str("from") ?? "")} → ${sentence(str("to") ?? "")}` : null;
    case "member.removed":
    case "member.reset_link_issued":
      return str("member") ?? null;
    case "workspace.settings_updated": {
      const changes = p.changes && typeof p.changes === "object" ? Object.keys(p.changes as object) : [];
      return changes.length ? `Changed: ${changes.map((c) => sentence(c)).join(", ")}` : null;
    }
    case "action.exported":
      return "Email sending isn't connected; the approved draft was exported";
    case "document.uploaded":
    case "document.deleted":
      return [str("filename"), str("document_type") && DOCUMENT_TYPE_LABEL[str("document_type") as DocumentType]]
        .filter(Boolean)
        .join(" · ");
    case "document.extraction.started":
      return str("document_type") ? DOCUMENT_TYPE_LABEL[str("document_type") as DocumentType] : null;
    case "document.extraction.failed":
      return str("error_code") ? `Reason: ${sentence(str("error_code")!.toLowerCase())}` : null;
    case "comparison.completed": {
      const n = num("finding_count");
      return n === undefined ? null : n === 1 ? "1 finding" : `${n} findings`;
    }
    case "investigation.completed":
      return str("status") ? `Status: ${CASE_STATUS_LABEL[str("status") as CaseStatus] ?? str("status")}` : null;
    case "field.corrected":
    case "field.verified":
      return [str("field_path") && humanizeFieldPath(str("field_path")), str("reason")].filter(Boolean).join(" · ");
    case "finding.reviewed":
    case "approval.decided":
      return str("decision") ? `Decision: ${sentence(str("decision")!)}` : null;
    default:
      return null;
  }
}
