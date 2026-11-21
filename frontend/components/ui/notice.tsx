import { CheckCircle2, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type NoticeTone = "info" | "success" | "warning" | "danger";

const styles: Record<NoticeTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: "border-info/25 bg-info-soft/60", icon: "text-info", Icon: Info },
  success: { box: "border-success/25 bg-success-soft/60", icon: "text-success", Icon: CheckCircle2 },
  warning: { box: "border-warning/30 bg-warning-soft/60", icon: "text-warning", Icon: TriangleAlert },
  danger: { box: "border-danger/25 bg-danger-soft/60", icon: "text-danger", Icon: OctagonAlert },
};

interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Compact banner: tone icon, title and text on as few lines as possible, optional action on the right. */
export function Notice({ tone = "info", title, children, action, className }: NoticeProps) {
  const s = styles[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-center gap-3 rounded-[10px] border px-3.5 py-2 text-[13px] leading-snug", s.box, className)}
    >
      <s.Icon aria-hidden className={cn("size-4 shrink-0", s.icon)} />
      <div className="min-w-0 flex-1 text-ink-2">
        {title ? <span className="font-semibold text-ink">{title}. </span> : null}
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
