# Requirements: Smart intake (drop a document, OpsWarden routes it)

## Introduction
Today a person opens a case, picks the supplier and purchase order, and uploads each document. Smart intake removes that work: a person drops an invoice or delivery receipt, OpsWarden reads it, finds the purchase order it belongs to, files it on the right case (or opens one), and starts the analysis once enough documents are present. People still review findings and approve every supplier letter.

## Requirement 1: Accept documents without a case

**User story:** As an AP clerk, I want to drop supplier documents in one place so that I don't have to create a case first.

### Acceptance criteria
1.1 WHEN a member with permission to create cases and upload documents submits a file and its document type to intake THE SYSTEM SHALL validate it exactly like a case upload (extension, MIME type, file signature, size limit).
1.2 WHEN the caller lacks those permissions THE SYSTEM SHALL refuse with 403, and WHEN the caller is not a member of the workspace THE SYSTEM SHALL respond 404.
1.3 WHEN the file can't be read (no text and OCR unavailable or failing) THE SYSTEM SHALL respond with a clear error and SHALL NOT create a case.

## Requirement 2: Read the document once

2.1 WHEN a file is accepted THE SYSTEM SHALL extract its fields with the same pipeline as analysis (text parser, then OCR for scans and unfamiliar layouts).
2.2 WHEN the document is filed on a case THE SYSTEM SHALL store the extracted fields and mark the document extracted, so the analysis doesn't read it again.

## Requirement 3: Find where it belongs

3.1 THE SYSTEM SHALL take the purchase-order reference from the document (`purchase_order_reference` for invoices and receipts, `document_number` for purchase orders) and compare it to registered purchase orders and open cases using normalized references.
3.2 WHEN an open case for that reference exists that does not yet have a document of this type THE SYSTEM SHALL file the document on the most recently updated such case.
3.3 WHEN no such case exists AND the reference matches a registered purchase order THE SYSTEM SHALL open a new case from that purchase order (supplier, reference, currency, and the PO file if one is registered) and file the document on it.
3.4 WHEN no purchase order matches AND the supplier name matches a registered supplier THE SYSTEM SHALL open a case for that supplier with the document's reference.
3.5 WHEN nothing matches THE SYSTEM SHALL open a case using the supplier name and reference printed on the document.
3.6 THE SYSTEM SHALL never file a document on a case in another workspace, or on a resolved, archived or processing case.

## Requirement 4: Start the analysis when it makes sense

4.1 WHEN the target case has an invoice and at least one of a purchase order or delivery receipt THE SYSTEM SHALL start the analysis in the background.
4.2 WHEN the case is missing documents THE SYSTEM SHALL say which ones and SHALL NOT start the analysis.

## Requirement 5: Explain what happened

5.1 THE SYSTEM SHALL return the case, whether it was created or reused, how it was matched (purchase order, open case, supplier, document only), the supplier and reference read, the documents still missing, and whether the analysis started.
5.2 THE SYSTEM SHALL record an audit event describing the routing decision.
