import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock3,
  FilePen,
  FileCheck2,
  FileClock,
  FileX2,
  Loader2,
  Send,
  ShieldAlert,
  Signature,
  TimerOff,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge, type Tone } from "@/components/ui/badge";
import { CASE_STATUS_LABEL } from "@/lib/format";
import type { ApprovalStatus, CaseStatus, FindingStatus, Role, Severity } from "@/lib/types";

type Spec = { tone: Tone; label: string; Icon?: LucideIcon; spin?: boolean };

function Stamp({ spec, className }: { spec: Spec; className?: string }) {
  const { Icon } = spec;
  return (
    <Badge tone={spec.tone} className={className} icon={Icon ? <Icon className={spec.spin ? "animate-spin" : undefined} /> : undefined}>
      {spec.label}
    </Badge>
  );
}

const CASE: Record<CaseStatus, Omit<Spec, "label">> = {
  draft: { tone: "neutral", Icon: FilePen },
  processing: { tone: "info", Icon: Loader2, spin: true },
  needs_review: { tone: "warning", Icon: AlertTriangle },
  ready_for_approval: { tone: "brand", Icon: Signature },
  in_progress: { tone: "info", Icon: Clock3 },
  resolved: { tone: "success", Icon: CheckCircle2 },
  failed: { tone: "danger", Icon: XCircle },
  archived: { tone: "neutral", Icon: Archive },
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const s = CASE[status] ?? { tone: "neutral" as Tone };
  return <Stamp spec={{ ...s, label: CASE_STATUS_LABEL[status] ?? status }} />;
}

const SEVERITY: Record<Severity, Spec> = {
  critical: { tone: "danger", label: "Critical", Icon: ShieldAlert },
  high: { tone: "danger", label: "High" },
  medium: { tone: "warning", label: "Medium" },
  low: { tone: "info", label: "Low" },
  info: { tone: "neutral", label: "Info" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity] ?? SEVERITY.info;
  return <Stamp spec={{ ...s, label: `${s.label} severity` }} />;
}

/** Left-edge colour for severity rules on finding sheets. */
export const SEVERITY_RULE: Record<Severity, string> = {
  critical: "bg-danger",
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-info",
  info: "bg-line-strong",
};

const FINDING: Record<FindingStatus, Spec> = {
  open: { tone: "brand", label: "Open", Icon: CircleDot },
  confirmed: { tone: "success", label: "Confirmed", Icon: BadgeCheck },
  dismissed: { tone: "neutral", label: "Dismissed", Icon: Ban },
  needs_review: { tone: "warning", label: "Needs review", Icon: AlertTriangle },
};

export function FindingStatusBadge({ status }: { status: FindingStatus }) {
  return <Stamp spec={FINDING[status] ?? FINDING.open} />;
}

const APPROVAL: Record<ApprovalStatus, Spec> = {
  pending: { tone: "brand", label: "Awaiting approval", Icon: Signature },
  approved: { tone: "success", label: "Approved", Icon: BadgeCheck },
  rejected: { tone: "neutral", label: "Rejected", Icon: Ban },
  executed: { tone: "success", label: "Sent", Icon: Send },
  failed: { tone: "danger", label: "Failed", Icon: XCircle },
  expired: { tone: "warning", label: "Expired", Icon: TimerOff },
};

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return <Stamp spec={APPROVAL[status] ?? APPROVAL.pending} />;
}

const DOC: Record<string, Spec> = {
  queued: { tone: "neutral", label: "Queued", Icon: FileClock },
  uploaded: { tone: "info", label: "Uploaded", Icon: CircleDashed },
  processing: { tone: "info", label: "Processing", Icon: Loader2, spin: true },
  extracted: { tone: "success", label: "Extracted", Icon: FileCheck2 },
  failed: { tone: "danger", label: "Failed", Icon: FileX2 },
  superseded: { tone: "neutral", label: "Superseded", Icon: Archive },
};

export function DocumentStatusBadge({ status }: { status: string }) {
  return <Stamp spec={DOC[status] ?? { tone: "neutral", label: status }} />;
}

const ROLE: Record<Role, Spec> = {
  admin: { tone: "brand", label: "Admin" },
  reviewer: { tone: "info", label: "Reviewer" },
  contributor: { tone: "neutral", label: "Contributor" },
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return <Stamp spec={ROLE[role] ?? { tone: "neutral", label: role }} className={className} />;
}

/** On/off state for integrations and policies, e.g. "Email sending: Connected". */
export function StateBadge({ on, onLabel = "On", offLabel = "Off" }: { on: boolean; onLabel?: string; offLabel?: string }) {
  return <Stamp spec={on ? { tone: "success", label: onLabel, Icon: CheckCircle2 } : { tone: "neutral", label: offLabel, Icon: CircleDashed }} />;
}
