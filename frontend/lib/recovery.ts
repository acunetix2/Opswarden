import type { Money, ResolutionOutcome } from "./types";

export const OUTCOMES: { value: ResolutionOutcome; label: string; hint: string; recovers: boolean }[] = [
  { value: "recovered", label: "Value recovered", hint: "Credit note, refund or deduction agreed with the supplier.", recovers: true },
  { value: "corrected_invoice", label: "Corrected invoice", hint: "The supplier reissued the invoice at the right amount.", recovers: true },
  { value: "no_discrepancy", label: "No discrepancy", hint: "The findings were explained and nothing is owed.", recovers: false },
  { value: "written_off", label: "Written off", hint: "The business accepts the difference.", recovers: false },
];

export function outcomeLabel(outcome: string | null | undefined): string | null {
  if (!outcome) return null;
  return OUTCOMES.find((o) => o.value === outcome)?.label ?? null;
}

export function outcomeRecovers(outcome: string): boolean {
  return OUTCOMES.find((o) => o.value === outcome)?.recovers ?? false;
}

const AMOUNT_RE = /^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,4})?$/;

/** Mirrors the server check so people see the problem before submitting. Empty is allowed. */
export function amountProblem(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.startsWith("-")) return "The recovered amount can't be negative.";
  if (!AMOUNT_RE.test(text)) return "Enter the recovered amount as a number, for example 1250.00.";
  return null;
}

/** Prefill: the case's exposure in its own currency, if there is one. */
export function defaultRecoveredAmount(exposure: Money[] | undefined, currency: string): string {
  const match = exposure?.find((m) => m.currency === currency);
  return match ? match.amount : "";
}
