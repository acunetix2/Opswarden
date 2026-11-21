import Link from "next/link";

import type { ReactNode } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Term } from "@/components/ui/term";

const STEPS: { title: string; body: ReactNode; href?: string; cta?: string }[] = [
  { title: "Open a case", body: "Name the supplier and the purchase you are checking.", href: "/app/investigations/new", cta: "New investigation" },
  { title: "Upload documents", body: "Add the purchase order, invoice and delivery receipt. Fields are extracted automatically." },
  {
    title: "Run the check",
    body: (
      <>
        The three documents are compared (a <Term term="three-way match" />). Every mismatch becomes a <Term term="finding" /> with its source.
      </>
    ),
  },
  { title: "Review findings", body: "Confirm real discrepancies, dismiss false alarms (a reason is required).", href: "/app/findings", cta: "All findings" },
  {
    title: "Draft and approve",
    body: (
      <>
        Draft the supplier email. A reviewer gives <Term term="approval" /> before anything is sent.
      </>
    ),
    href: "/app/approvals",
    cta: "Approvals",
  },
  { title: "Resolve", body: "Close the case once the supplier has answered. The full history stays on the case.", href: "/app/investigations?status=resolved", cta: "Resolved cases" },
];

/** Plain-language map of the case lifecycle, so each page has a place in the flow. */
export function FlowGuide() {
  return (
    <Card>
      <CardHeader index="04" title="How a case moves" description="Every investigation follows these six steps. Open any case to see which one it is on." />
      <CardBody>
        <ol className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-sunken text-[12px] font-semibold text-ink-2" aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink">{s.title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{s.body}</p>
                {s.href ? (
                  <Link href={s.href} className="mt-1 inline-block text-[12.5px] text-brand-ink underline-offset-2 hover:underline">
                    {s.cta}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}