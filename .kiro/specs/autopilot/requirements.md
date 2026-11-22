# Requirements: Autopilot (less hand work after an analysis)

## Introduction
After an analysis, people still had to draft the supplier letter, request approval, chase a reviewer, close cases where nothing was wrong, and type suppliers and purchase orders into the register by hand. Autopilot does that routine work. People keep the decisions: confirming findings, approving the exact letter, reopening a case.

## Requirement 1: Fill the register from documents
1.1 WHEN a document is read THE SYSTEM SHALL store its own number (invoice, PO or receipt number) on the document and make it searchable.
1.2 WHEN the document names a supplier that isn't registered in the workspace THE SYSTEM SHALL add it with the contact details printed for the supplier (email, phone, address, vendor code).
1.3 WHEN the supplier is registered THE SYSTEM SHALL fill only empty fields and SHALL NOT overwrite anything a person entered.
1.4 WHEN the document is a purchase order, or cites one, that isn't registered THE SYSTEM SHALL add it under that supplier; a purchase order document also gives the register its own copy of the file.
1.5 THE SYSTEM SHALL link the case to the supplier and purchase order when the case has none, and SHALL never match records from another workspace.
1.6 THE SYSTEM SHALL record an audit event for each addition, naming the source document.
1.7 WHEN updating the register fails THE SYSTEM SHALL continue the analysis.

## Requirement 2: Follow up after an analysis
2.1 WHEN all three documents are present, nothing needs a person's check and there are no findings THE SYSTEM SHALL close the case with the outcome "no discrepancy" and a note saying the documents agree.
2.2 WHEN there are findings and nothing is uncertain THE SYSTEM SHALL draft the supplier letter and queue it for approval, unless the case already has a pending or approved letter.
2.3 WHEN a letter is queued THE SYSTEM SHALL email the workspace's approvers (admins, and reviewers when the policy lets them approve). The email SHALL say that nothing has been sent to the supplier.
2.4 WHEN the case needs review THE SYSTEM SHALL email reviewers and admins.
2.5 THE SYSTEM SHALL send at most one notification of each kind per case per hour.
2.6 THE SYSTEM SHALL record `automation.completed` with the actions taken, even when a step fails.
2.7 THE SYSTEM SHALL NOT send anything to a supplier as part of the follow-up.

## Requirement 3: Send on approval
3.1 WHEN an approver approves a letter AND sending on approval is on AND email is configured AND the letter has a recipient AND the approver may run external actions THE SYSTEM SHALL send it straight away, with every execute-time check (permission, policy, payload hash, idempotency key).
3.2 WHEN sending fails THE SYSTEM SHALL leave the letter approved so a person can retry.

## Requirement 4: Control
4.1 THE SYSTEM SHALL let admins switch each behaviour on or off: register, closing clean cases, drafting letters, reviewer emails, sending on approval. All default to on.
4.2 THE SYSTEM SHALL record every change to the switches in the activity log.

## Requirement 5: Show the run
5.1 WHILE an analysis runs THE SYSTEM SHALL show five stages (read documents, update register, three-way match, weigh findings, follow up) as circles joined by lines, horizontal on wide screens and vertical on narrow ones.
5.2 THE SYSTEM SHALL animate the stage in progress, tick each completed stage, and mark the stage where a failed run stopped.
5.3 THE SYSTEM SHALL keep the finished run visible until the person hides it, with a one-line result per stage.
5.4 WHEN the person prefers reduced motion THE SYSTEM SHALL show the same states without spinning or scaling.
