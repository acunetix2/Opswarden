import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/*
 * Sample procurement documents, drawn in HTML so they stay sharp at any size.
 * The figures match the sample case used across the landing page:
 * PO-1048 orders 50 x Product B at 12.00; GRN-77 records 40 received;
 * INV-8821 bills all 50. Decorative: hidden from assistive tech.
 */

const PAPER = "#FBF7EE";
const INK = "#1D2330";
const FAINT = "#7A7F88";
const RULE = "#E4DCCB";
const PEN = "#C2341F"; // reviewer's red pen
const BLUE = "#2849A8"; // the warehouse clerk's biro

function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative select-none overflow-hidden rounded-[6px] p-5 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.7),0_2px_6px_rgb(0_0_0/0.18)]", className)}
      style={{
        backgroundColor: PAPER,
        color: INK,
        // A faint fold and the warmth of real paper.
        backgroundImage: `linear-gradient(180deg, rgb(255 255 255 / 0.5), transparent 30%), linear-gradient(90deg, transparent 49.6%, rgb(0 0 0 / 0.035) 50%, transparent 50.4%)`,
      }}
    >
      {children}
    </div>
  );
}

function Row({ cells, bold, className }: { cells: ReactNode[]; bold?: boolean; className?: string }) {
  return (
    <div
      className={cn("grid grid-cols-[1fr_2.4rem_3rem_3.6rem] items-baseline gap-2 border-b py-1.5 text-[10.5px]", bold && "font-semibold", className)}
      style={{ borderColor: RULE }}
    >
      {cells.map((c, i) => (
        <span key={i} className={i === 0 ? "truncate" : "text-right font-mono tabular-nums"}>
          {c}
        </span>
      ))}
    </div>
  );
}

/** Red-pen ring around a figure, as a reviewer would mark it. */
function Ring({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block px-0.5">
      {children}
      <svg viewBox="0 0 40 22" className="pointer-events-none absolute -inset-x-1.5 -inset-y-1 h-[calc(100%+0.5rem)] w-[calc(100%+0.75rem)] overflow-visible">
        <path d="M6 4 C 18 -1, 36 2, 37 11 S 22 22, 9 19 S 1 9, 10 3" fill="none" stroke={PEN} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function InvoicePaper({ className }: { className?: string }) {
  return (
    <Sheet className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-display)] text-[17px] italic leading-none">Northstar</p>
          <p className="mt-1 text-[8.5px] leading-tight" style={{ color: FAINT }}>
            Office Supplies Ltd
            <br />
            14 Quay Street, Leeds
          </p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-semibold leading-none tracking-[-0.02em]">Invoice</p>
          <p className="mt-1 font-mono text-[9.5px]" style={{ color: FAINT }}>INV-8821</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[8.5px]" style={{ color: FAINT }}>
        <p>
          Date
          <br />
          <span className="font-mono text-[9.5px]" style={{ color: INK }}>05 Nov 2026</span>
        </p>
        <p>
          Your PO
          <br />
          <span className="font-mono text-[9.5px]" style={{ color: INK }}>PO-1048</span>
        </p>
        <p>
          Terms
          <br />
          <span className="text-[9.5px]" style={{ color: INK }}>30 days</span>
        </p>
      </div>
      <div className="mt-3">
        <Row cells={["Item", "Qty", "Price", "Amount"]} className="text-[9px] font-medium" />
        <Row cells={["Product B · A4 binders", <Ring key="q">50</Ring>, "12.00", "600.00"]} />
        <Row cells={["Delivery", "1", "0.00", "0.00"]} />
        <div className="mt-2 flex justify-end gap-4 text-[11px] font-semibold">
          <span style={{ color: FAINT }} className="font-normal">Total due</span>
          <span className="font-mono tabular-nums">600.00 USD</span>
        </div>
      </div>
    </Sheet>
  );
}

export function ReceiptPaper({ className }: { className?: string }) {
  return (
    <Sheet className={className}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold leading-tight tracking-[-0.01em]">Goods received note</p>
          <p className="mt-1 font-mono text-[9.5px]" style={{ color: FAINT }}>GRN-77 · PO-1048</p>
        </div>
        <p className="text-[8.5px] leading-tight" style={{ color: FAINT }}>
          Dock 3
          <br />
          Bay C
        </p>
      </div>
      <div className="mt-3">
        <Row cells={["Item", "Ord.", "Recd.", ""]} className="text-[9px] font-medium" />
        <Row
          cells={[
            "Product B · A4 binders",
            "50",
            <span key="r" className="font-[family-name:var(--font-display)] text-[15px] italic leading-none" style={{ color: BLUE }}>
              40
            </span>,
            "",
          ]}
        />
        <p className="mt-1.5 font-[family-name:var(--font-display)] text-[12.5px] italic" style={{ color: BLUE }}>
          10 short, 2 cartons missing
        </p>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <svg viewBox="0 0 90 26" className="h-6 w-20" fill="none">
            <path d="M3 18 C 10 4, 14 4, 15 16 S 24 6, 28 15 C 32 22, 38 4, 44 14 S 56 18, 60 9 C 64 3, 70 20, 86 12" stroke={BLUE} strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <p className="border-t pt-0.5 text-[8px]" style={{ borderColor: RULE, color: FAINT }}>Received by</p>
        </div>
        <span
          className="rotate-[-9deg] rounded-[4px] border-2 px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em]"
          style={{ borderColor: `${PEN}cc`, color: `${PEN}dd` }}
        >
          Received 03 Nov
        </span>
      </div>
    </Sheet>
  );
}

export function PurchaseOrderPaper({ className }: { className?: string }) {
  return (
    <Sheet className={className}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[18px] font-semibold leading-none tracking-[-0.02em]">Purchase order</p>
          <p className="mt-1 font-mono text-[9.5px]" style={{ color: FAINT }}>PO-1048 · 01 Nov 2026</p>
        </div>
        <p className="text-right text-[8.5px] leading-tight" style={{ color: FAINT }}>
          To: Northstar
          <br />
          Office Supplies Ltd
        </p>
      </div>
      <div className="mt-3">
        <Row cells={["Item", "Qty", "Price", "Amount"]} className="text-[9px] font-medium" />
        <Row cells={["Product B · A4 binders", "50", "12.00", "600.00"]} />
        <div className="mt-2 flex justify-end gap-4 text-[11px] font-semibold">
          <span style={{ color: FAINT }} className="font-normal">Order total</span>
          <span className="font-mono tabular-nums">600.00 USD</span>
        </div>
      </div>
      <p className="mt-3 text-[8.5px]" style={{ color: FAINT }}>Approved by procurement · deliver to Dock 3</p>
    </Sheet>
  );
}
