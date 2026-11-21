# API Contracts
## OpsWarden MVP

**Base path:** `/api/v1`  
**Format:** JSON unless the endpoint is a multipart upload.  
**Authentication:** authenticated session or bearer token.  
**Authorization:** every case/document/action request must be checked against workspace membership and role.

These are proposed contracts. Align implementation with the chosen authentication provider and generated OpenAPI schema.

## 1. Common conventions

### Error shape

```json
{
  "error": {
    "code": "CASE_NOT_FOUND",
    "message": "The requested case was not found.",
    "request_id": "req_01H..."
  }
}
```

Do not return stack traces, provider secrets, or internal prompts.

### Pagination

Use `limit` and `cursor` for list endpoints. Return:

```json
{
  "items": [],
  "next_cursor": null
}
```

## 2. Workspaces

### `GET /workspaces`
Returns workspaces available to the authenticated user.

### `GET /workspaces/{workspace_id}`
Returns workspace details after membership verification.

## 3. Cases

### `POST /workspaces/{workspace_id}/cases`

Request:

```json
{
  "title": "Northstar invoice discrepancy",
  "supplier_name": "Northstar Office Supplies",
  "supplier_reference": "PO-1048",
  "currency": "USD",
  "notes": "Please verify delivered quantities."
}
```

Response `201`:

```json
{
  "id": "case_uuid",
  "case_number": "OW-2026-0042",
  "title": "Northstar invoice discrepancy",
  "supplier_name": "Northstar Office Supplies",
  "status": "draft",
  "created_at": "2026-10-30T12:00:00Z"
}
```

### `GET /workspaces/{workspace_id}/cases`
Query parameters: `status`, `search`, `owner_id`, `limit`, `cursor`.

### `GET /cases/{case_id}`
Returns case details, documents, findings summary, and current workflow status after authorization.

### `PATCH /cases/{case_id}`
Allows permitted metadata updates. Status changes must use controlled service transitions rather than arbitrary client-provided status values.

### `POST /cases/{case_id}/analyze`
Starts or resumes the processing workflow. Require idempotency protection.

Response `202`:

```json
{
  "case_id": "case_uuid",
  "status": "processing",
  "run_id": "run_uuid"
}
```

## 4. Documents

### `POST /cases/{case_id}/documents`

Multipart fields:
- `file`: binary file.
- `document_type`: `purchase_order`, `invoice`, or `delivery_receipt`.

Response `202`:

```json
{
  "document_id": "document_uuid",
  "processing_status": "queued",
  "filename": "supplier-invoice.pdf"
}
```

### `GET /cases/{case_id}/documents`
Returns document metadata and processing status, not permanent public storage URLs.

### `GET /documents/{document_id}/download`
Returns an authorized short-lived download or preview URL.

### `PATCH /documents/{document_id}/extracted-fields`
Accepts user corrections. Require field-level validation and record the original and corrected values.

Example:

```json
{
  "corrections": [
    {
      "field_path": "line_items[0].quantity",
      "value": "40",
      "reason": "Verified against the source document."
    }
  ]
}
```

## 5. Findings

### `GET /cases/{case_id}/findings`

Response:

```json
{
  "items": [
    {
      "id": "finding_uuid",
      "rule_id": "INVOICE_QTY_GT_RECEIVED",
      "severity": "high",
      "title": "Invoice quantity exceeds delivered quantity",
      "description": "The invoice lists 50 units while the delivery receipt records 40.",
      "expected_value": {
        "field": "received_quantity",
        "value": "40"
      },
      "observed_value": {
        "field": "invoiced_quantity",
        "value": "50"
      },
      "evidence": [
        {
          "document_id": "delivery_doc_uuid",
          "field_path": "line_items[0].quantity",
          "page_number": 1
        },
        {
          "document_id": "invoice_doc_uuid",
          "field_path": "line_items[0].quantity",
          "page_number": 1
        }
      ],
      "status": "open"
    }
  ]
}
```

### `POST /findings/{finding_id}/review`
Body:

```json
{
  "decision": "confirm",
  "comment": "Verified against the delivery receipt."
}
```

Allowed decisions: `confirm`, `dismiss`, `needs_review`. Dismissal requires a reason.

## 6. Recommendations and approvals

### `POST /cases/{case_id}/recommendations/email-draft`

Creates a draft from validated case findings.

Response:

```json
{
  "recommendation_id": "recommendation_uuid",
  "type": "supplier_clarification_email",
  "status": "draft",
  "subject": "Clarification requested for PO-1048 / INV-8821",
  "body": "Hello ...",
  "recipient": null,
  "requires_human_review": true
}
```

Recipient must come from trusted workspace/supplier data or be entered and verified by a user. Never fabricate an email address.

### `POST /recommendations/{recommendation_id}/request-approval`

Creates a pending approval using the exact proposed payload.

### `POST /approvals/{approval_id}/decision`

Body:

```json
{
  "decision": "approve",
  "comment": "Reviewed the evidence and approved this email."
}
```

Allowed decisions: `approve`, `reject`.

### `POST /approvals/{approval_id}/execute`

Executes only if:
- Approval is valid and approved.
- Payload has not changed since approval.
- User/action permissions are still valid.
- Integration is configured.
- Idempotency key has not already been used.

Response:

```json
{
  "approval_id": "approval_uuid",
  "status": "executed",
  "provider_reference": "provider_message_id"
}
```

If email sending is not configured, expose an export/copy action instead of pretending that the email was sent.

## 7. Activity

### `GET /cases/{case_id}/activity`
Returns a chronological, permission-filtered audit timeline.

### `GET /workspaces/{workspace_id}/activity`
Returns workspace activity for authorized administrators.

## 8. Processing events

Optional server-sent event stream:

`GET /cases/{case_id}/events`

Event types:
- `document.uploaded`
- `document.extraction.started`
- `document.extraction.completed`
- `document.extraction.failed`
- `comparison.started`
- `comparison.completed`
- `investigation.completed`
- `approval.requested`
- `approval.decided`
- `action.executed`
- `action.failed`

Do not send private document contents or secrets through event payloads.

## 9. Status codes

- `200` successful read/update.
- `201` resource created.
- `202` asynchronous job accepted.
- `400` malformed request.
- `401` unauthenticated.
- `403` authenticated but not authorized.
- `404` resource not found or not visible to caller.
- `409` invalid state transition or idempotency conflict.
- `413` upload too large.
- `415` unsupported file type.
- `422` schema or validation error.
- `429` rate limited.
- `500` unexpected server error.
- `503` temporary dependency unavailable.

## 10. Contract rules

- Validate all input on the server.
- Use decimal strings or decimal-safe values for money and quantities.
- Version extraction and response schemas.
- Never trust workspace IDs supplied by the browser without membership checks.
- Use idempotency keys for job starts and external actions.
- Avoid returning storage object keys or unrestricted URLs.
- Document the final API through FastAPI OpenAPI output.
