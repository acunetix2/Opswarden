# OpsWarden — Image Preview & Visual Reference Brief

**Purpose:** This document defines the visual references and mockup prompts for the OpsWarden interface. It is a design handoff document; the prompts can be used with an image-generation or UI-mockup tool. Generated mockups are inspiration only and must not replace functional, accessible UI implementation.

## 1. Overall visual direction

Create a premium enterprise SaaS operations console.

- Theme: dark midnight / charcoal interface.
- Accent: restrained amber-orange.
- Supporting colors: green for resolved, yellow for review, red for errors, blue for information.
- Typography: Inter or Manrope.
- Layout: structured, grid-based, spacious, information-dense but readable.
- Mood: trustworthy, precise, calm, intelligent.
- Avoid: Halloween clichés, skulls, ghosts, excessive neon, cyberpunk clutter, random charts, fake metrics, illegible microtext.

OpsWarden is a serious business product being submitted to a Halloween-themed hackathon. The product itself should remain professional; the seasonal theme should not undermine trust.

## 2. Brand and logo direction

### Wordmark

- Text: `OpsWarden` (exact casing).
- Use a clean geometric sans-serif.
- Optional symbol: a simplified shield/compass/check motif that suggests oversight and resolution.
- Avoid literal ghost or monster mascots.
- Icon should remain legible at 24 px and 32 px.

### Brand prompt

> Design a restrained enterprise SaaS brand identity for “OpsWarden”, an AI business operations and investigation platform. Create a simple geometric shield/compass symbol suggesting oversight, evidence, and controlled execution. Pair it with a modern readable wordmark. Midnight charcoal background, warm amber accent, subtle neutral tones. Professional B2B software identity, vector-like, clean, scalable, no Halloween clichés, no extra text.

## 3. Screen preview prompts

### Preview A — Overview dashboard

**Purpose:** Show the operational command center at a glance.

Prompt:

> High-fidelity desktop UI mockup for OpsWarden, a premium enterprise AI business operations SaaS. Dark midnight charcoal interface, left vertical navigation, top workspace bar, large page heading “Overview”, a clear amber “New investigation” primary action, four realistic metric cards for Open investigations, Needs review, Awaiting approval, and Resolved, a “Needs your attention” section, recent investigations table, and compact activity feed. Use clean Inter typography, subtle borders, restrained amber accents, green/yellow/red status indicators with labels, consistent spacing, realistic enterprise data, polished but practical. 16:10 desktop screenshot composition. No browser chrome, no device mockup, no random charts, no illegible tiny text.

### Preview B — New investigation wizard

**Purpose:** Show the easy intake process.

Prompt:

> High-fidelity desktop SaaS UI mockup for OpsWarden showing a three-step “New investigation” wizard. Dark charcoal enterprise interface with amber accent. Step 1 case details with supplier, case title, reference and currency fields. Step 2 three document upload panels labelled Purchase Order, Supplier Invoice, Delivery Receipt, each with file icon, filename, upload state and replace action. Step 3 review summary and “Start analysis” button. Clear labels, accessible contrast, professional spacing, simple visual hierarchy, 16:10 screenshot, no decorative clutter.

### Preview C — Investigation detail and discrepancy

**Purpose:** The hero screen for the hackathon demo.

Prompt:

> High-fidelity enterprise SaaS UI mockup for OpsWarden showing an invoice investigation detail page. Dark midnight interface, amber accent. Header with case ID, supplier name and “Needs review” status. Main area shows a concise investigation summary and a prominent discrepancy card: “Invoice quantity exceeds delivered quantity”. Include a comparison table with Ordered 50, Received 40, Invoiced 50; evidence references to purchase order, delivery receipt and supplier invoice; a short factual explanation; a recommendation panel suggesting supplier clarification and human approval. Right side contains source document list and activity timeline. Make facts, AI recommendations and approval actions visually distinct. Polished B2B software, 16:10 screenshot, realistic readable UI.

### Preview D — Evidence viewer

**Purpose:** Make traceability visible.

Prompt:

> High-fidelity dark enterprise application UI for OpsWarden, an AI procurement investigation tool. Show a split-screen evidence viewer: left side a PDF-like supplier invoice preview with a subtle highlighted line item; right side an extracted data panel with document name, page number, field name, extracted value, extraction confidence label, and a linked discrepancy. Dark charcoal and slate surfaces, amber highlight, clean typography, subtle borders, accessible readable layout, no fabricated logos, 16:10 screenshot.

### Preview E — Approval center

**Purpose:** Demonstrate safe human-in-the-loop execution.

Prompt:

> Premium enterprise SaaS approval center mockup for OpsWarden. Dark charcoal UI with amber accents. Show a pending action card for a supplier clarification email, case reference, recipient placeholder clearly marked as not configured, editable message preview, evidence links, explanation of why approval is needed, and two distinct actions: “Approve action” and “Reject”. Include a clear note that no email is sent until approval. Professional, calm, trustworthy visual hierarchy, 16:10 desktop screenshot.

### Preview F — Responsive mobile case view

**Purpose:** Show that urgent operational review works on mobile.

Prompt:

> High-fidelity mobile UI mockup for OpsWarden, a premium dark enterprise operations app. Show a case detail screen with supplier name, case status “Needs review”, one discrepancy card with ordered 50, received 40, invoiced 50, an evidence link, recommendation summary, and a clear “Review action” button. Midnight charcoal background, amber accents, readable Inter typography, accessible touch targets, minimal bottom navigation, realistic mobile app screenshot, no device frame.

## 4. Demo visual sequence

For a three-minute hackathon demo, prepare these screens in order:

1. Overview dashboard — introduce OpsWarden and show the “New investigation” action.
2. New investigation — upload the PO, invoice, and delivery receipt.
3. Processing state — show document extraction and workflow progress.
4. Investigation result — reveal the quantity mismatch.
5. Evidence viewer — open the source values that support the finding.
6. Recommendation — show a supplier clarification draft.
7. Approval — approve the proposed action or demonstrate the approval gate.
8. Audit timeline — show that the action and investigation are recorded.

The demo must use a real working application. Static mockups should only be used for design planning or as clearly labelled slides.

## 5. Data for consistent mockups

Use this illustrative sample across all mockups:

- Supplier: Northstar Office Supplies (fictional).
- Case: `OW-2026-0042`.
- Purchase order: `PO-1048`.
- Invoice: `INV-8821`.
- Product B ordered: 50 units.
- Product B received: 40 units.
- Product B invoiced: 50 units.
- Unit price: 12.00 (illustrative currency; show currency configuration in the UI).
- Finding: invoice quantity exceeds recorded received quantity by 10 units.
- Recommendation: request supplier clarification; hold the case for human review.

Do not present these sample values as real business data or real performance metrics.

## 6. Image and asset checklist

- [ ] OpsWarden logo / app icon.
- [ ] Overview dashboard concept.
- [ ] New investigation wizard concept.
- [ ] Investigation detail concept.
- [ ] Evidence viewer concept.
- [ ] Approval center concept.
- [ ] Mobile case view concept.
- [ ] Optional product landing-page hero.
- [ ] Consistent icon set (Lucide or equivalent).
- [ ] No third-party brand marks without permission.
- [ ] No copyrighted music or unlicensed imagery in the demo.

## 7. Implementation note

Use the previews as visual references. Rebuild every UI element with real frontend components, real application data, semantic HTML, and accessible interactions. Do not use a generated screenshot as the application interface.
