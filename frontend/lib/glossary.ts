/** Plain-language definitions for procurement terms used across the app. */
export const GLOSSARY = {
  "three-way match":
    "Checking the purchase order, the supplier invoice and the delivery receipt against each other. If all three agree, the invoice is safe to pay.",
  finding:
    "A specific mismatch between your documents, for example being billed for 50 units when 40 were delivered. Each finding points to the document and field it came from.",
  exposure:
    "Money still in dispute: the total impact of findings that are open, confirmed or awaiting review. Dismissed findings are not counted.",
  tolerance:
    "How much difference is allowed before something counts as a mismatch, for example a 1% price difference for rounding.",
  severity:
    "How serious a finding is. Critical and high usually mean money is at risk; low and info are worth a look but rarely block payment.",
  approval:
    "A recorded sign-off from a reviewer. Nothing leaves OpsWarden, such as a supplier email, until someone with permission approves it.",
  dismiss:
    "Mark a finding as not a real problem. A reason is required and kept in the audit trail. You can reopen it later.",
  confirm: "Agree that a finding is a real discrepancy that needs action with the supplier.",
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY;
