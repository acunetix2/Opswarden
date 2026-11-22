---
inclusion: always
---
# OpsWarden product steering

OpsWarden is a human-supervised procurement investigation workspace for small and mid-sized finance and procurement teams. It reconciles a purchase order (PO), a delivery receipt and a supplier invoice (a three-way match), shows every discrepancy with the document field it came from, and drafts the supplier email for a person to approve.

## Who it is for
- Accounts payable clerks and procurement officers who today compare three PDFs by eye.
- Finance controllers and reviewers who must sign off before a supplier is contacted or a payment is held.

## Product principles (in priority order)
1. **Evidence first.** Every finding names the rule, expected and observed values, the impact, and links to the exact document field. Never show a conclusion without its evidence.
2. **Deterministic numbers.** Matching, arithmetic, impact and severity come from plain code with `Decimal`. A model may read a scan or polish wording; it never decides a finding, a severity or an amount.
3. **People approve side effects.** Nothing reaches a supplier until an authorized reviewer approves the exact text (payload hash lock). Agents propose; people confirm.
4. **Everything on the record.** Uploads, corrections, decisions, approvals, sends and profile changes are audit events.
5. **Works without AI.** If a model is unavailable, the product still works: templates replace AI drafts, built-in help replaces Warden.

## Vocabulary (use these words in UI copy and docs)
- **Case** (not "ticket"), **finding** (not "issue"), **evidence**, **supplier letter**, **approval**, **exposure** (value in dispute), **recovered** (value settled in the business's favour), **register** (registered suppliers and purchase orders), **Warden** (the in-app assistant, built by the OpsWarden team).

## Writing style for UI copy
Plain, specific, calm. Sentence case. No all-caps labels, no exclamation marks, no jargon like "leverage". Error messages say what happened and what to do next.

## Out of scope
Payments, ERP write-back, automatic sending without approval, accusing suppliers of fraud.
