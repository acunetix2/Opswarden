/**
 * API types mirroring the FastAPI schemas (backend/app/schemas).
 * Money and quantities arrive as decimal strings and stay strings here;
 * the frontend formats them for display but never does money arithmetic.
 */

export type Role = "admin" | "reviewer" | "contributor";

export type CaseStatus =
  | "draft"
  | "processing"
  | "needs_review"
  | "ready_for_approval"
  | "in_progress"
  | "resolved"
  | "failed"
  | "archived";

export type DocumentType = "purchase_order" | "invoice" | "delivery_receipt";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type FindingStatus = "open" | "confirmed" | "dismissed" | "needs_review";
/** Reviewer decisions accepted by POST /findings/{id}/review. "reopen" undoes a confirm or dismiss. */
export type FindingDecision = "confirm" | "dismiss" | "needs_review" | "reopen";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "executed" | "failed" | "expired";
export type ActorType = "user" | "system" | "agent" | "integration";

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
}

export interface Workspace {
  id: string;
  name: string;
  role: Role;
}

export interface Money {
  currency: string;
  amount: string;
}

export interface Case {
  id: string;
  workspace_id: string;
  case_number: string;
  title: string;
  supplier_name: string | null;
  supplier_reference: string | null;
  supplier_id?: string | null;
  purchase_order_id?: string | null;
  supplier_contact_email?: string | null;
  currency: string;
  notes: string | null;
  status: CaseStatus;
  owner_user_id: string;
  owner_name: string | null;
  finding_count: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_outcome?: ResolutionOutcome | null;
  recovered_amount?: string | null;
  resolution_note?: string | null;
}

export type ResolutionOutcome = "recovered" | "corrected_invoice" | "no_discrepancy" | "written_off";

export interface Supplier {
  name: string;
  total_cases: number;
  open_cases: number;
  resolved_cases: number;
  active_findings: number;
  exposure: Money[];
  last_activity_at: string;
  latest_case_id: string;
}

export interface WorkspaceSettings {
  workspace_id: string;
  workspace_name: string;
  your_role: Role;
  price_tolerance: string;
  quantity_tolerance: string;
  reviewers_can_approve: boolean;
  policy_updated_at: string | null;
  policy_updated_by_name: string | null;
  max_upload_bytes: number;
  accepted_extensions: string[];
  ocr_available: boolean;
  tts_available?: boolean;
  stt_available?: boolean;
  email_configured: boolean;
  email_sender: string | null;
  storage_backend?: string;
  llm_configured: boolean;
  llm_provider: string | null;
  approval_required: boolean;
  auto_register?: boolean;
  auto_draft_letters?: boolean;
  auto_resolve_clean?: boolean;
  notify_reviewers?: boolean;
  send_on_approval?: boolean;
}

export interface CaseCreate {
  title: string;
  supplier_name?: string | null;
  supplier_reference?: string | null;
  currency: string;
  notes?: string | null;
  /** Registered supplier / purchase order; the PO's file is attached to the new case. */
  supplier_id?: string | null;
  purchase_order_id?: string | null;
}

export interface OverviewMetrics {
  open_cases: number;
  open_cases_created_in_period: number;
  needs_review: number;
  pending_approvals: number;
  open_findings: number;
  findings_in_period: number;
  resolved_in_period: number;
  exposure: Money[];
  recovered_in_period?: Money[];
  recovered_total?: Money[];
}

export interface SeriesPoint {
  date: string;
  created: number;
  resolved: number;
}

export interface AttentionItem {
  kind: "approval" | "review" | "prepare" | "start";
  title: string;
  case_id: string;
  case_number: string;
  supplier_name: string | null;
  reference: string | null;
  approval_id: string | null;
}

export interface RecentCase {
  id: string;
  case_number: string;
  title: string;
  supplier_name: string | null;
  status: CaseStatus;
  finding_count: number;
  exposure: Money | null;
  created_at: string;
  updated_at: string;
}

export interface Overview {
  workspace_name: string;
  period_days: number;
  metrics: OverviewMetrics;
  series: SeriesPoint[];
  attention: AttentionItem[];
  recent_cases: RecentCase[];
}

export interface Member {
  user_id: string;
  full_name: string;
  email: string;
  role: Role;
  joined_at: string;
}

export interface DocumentMeta {
  id: string;
  case_id: string;
  document_type: DocumentType;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  processing_status: string;
  error_code: string | null;
  /** The document's own number as read (invoice no, PO no). */
  document_number?: string | null;
  created_at: string;
}

export interface WorkspaceDocument extends DocumentMeta {
  case_number: string | null;
  case_title: string | null;
}

export interface ExtractedField {
  id: string;
  document_id: string;
  field_path: string;
  value: string;
  confidence: number | null;
  source_page: number | null;
  source_text: string | null;
  review_status: "auto" | "needs_review" | "corrected" | string;
}

export interface ExtractionReview {
  document_id: string;
  document_type: DocumentType;
  status: string;
  fields: ExtractedField[];
}

export interface FieldCorrection {
  field_path: string;
  value: string;
  reason?: string | null;
}

export interface Evidence {
  document_id: string | null;
  field_path: string | null;
  page_number: number | null;
  snippet: string | null;
}

export interface ComparedValue {
  field?: string;
  value?: string;
  values?: Record<string, string>;
}

export interface Finding {
  id: string;
  rule_id: string;
  finding_type: string;
  severity: Severity;
  title: string;
  description: string;
  expected_value: ComparedValue | null;
  observed_value: ComparedValue | null;
  impact_amount: string | null;
  currency: string | null;
  evidence: Evidence[];
  status: FindingStatus;
  requires_review: boolean;
}

export interface CaseSummary {
  case_id: string;
  analyzed: boolean;
  active_findings: number;
  by_severity: Partial<Record<Severity, number>>;
  exposure: Money[];
  summary: string;
  recommended_next_step: string;
}

export interface ComparisonLine {
  key: string;
  sku: string | null;
  description: string | null;
  ordered: string | null;
  received: string | null;
  invoiced: string | null;
  po_unit_price: string | null;
  invoice_unit_price: string | null;
  match_method: "sku" | "fuzzy" | "unmatched" | string;
}

export interface Comparison {
  case_id: string;
  currency: string;
  documents_present: DocumentType[];
  lines: ComparisonLine[];
}

export interface EmailDraft {
  recommendation_id: string;
  type: string;
  status: string;
  subject: string;
  body: string;
  recipient: string | null;
  /** register = typed by a person; document = read from a supplier document, not yet confirmed. */
  recipient_source?: "register" | "document" | null;
  requires_human_review: boolean;
  ai_assisted: boolean;
  model: string | null;
  fallback_reason: string | null;
}

export interface Approval {
  id: string;
  case_id: string;
  case_number: string | null;
  case_title: string | null;
  supplier_name: string | null;
  rationale: string | null;
  comment: string | null;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  action_type: string;
  status: ApprovalStatus;
  subject: string | null;
  body: string | null;
  recipient: string | null;
  /** "document" when OpsWarden read the address from a supplier document. */
  recipient_source?: string | null;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  executed_at: string | null;
  provider_reference: string | null;
  created_at: string;
}

export interface ExportedDraft {
  subject: string | null;
  body: string | null;
  recipient: string | null;
  note: string;
}

export interface ExecuteResult {
  approval_id: string;
  status: ApprovalStatus;
  provider_reference: string | null;
  export: ExportedDraft | null;
}

export interface ActivityEvent {
  id: string;
  case_id: string | null;
  case_number: string | null;
  actor_type: ActorType;
  actor_id: string | null;
  actor_name: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface WorkspaceSettingsUpdate {
  workspace_name?: string;
  price_tolerance?: string;
  quantity_tolerance?: string;
  reviewers_can_approve?: boolean;
  auto_register?: boolean;
  auto_draft_letters?: boolean;
  auto_resolve_clean?: boolean;
  notify_reviewers?: boolean;
  send_on_approval?: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by_name: string | null;
  expires_at: string;
  created_at: string;
  invite_url: string | null;
  email_sent: boolean;
}

export interface InvitationLookup {
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: Role;
  invited_by_name: string | null;
  expires_at: string;
  account_exists: boolean;
}

export interface NotificationItem {
  id: string;
  event_type: string;
  case_id: string | null;
  case_number: string | null;
  actor_type: ActorType;
  actor_name: string | null;
  detail: Record<string, string>;
  created_at: string;
  unread: boolean;
}

export interface Notifications {
  items: NotificationItem[];
  unread_count: number;
}

/** One frame from GET /cases/{id}/events. */
export interface CaseStreamEvent {
  type: string;
  case_id: string;
  actor_type: ActorType;
  created_at: string;
  payload: Record<string, string | number>;
  case_status: CaseStatus | null;
}

/** One row of GET /workspaces/{id}/findings (cross-case register). */
export interface WorkspaceFinding {
  id: string;
  case_id: string;
  case_number: string;
  case_title: string;
  supplier_name: string | null;
  rule_id: string;
  finding_type: string;
  severity: Severity;
  title: string;
  impact_amount: string | null;
  currency: string | null;
  status: FindingStatus;
  created_at: string;
}

/** POST /auth/signup/start and /auth/signup/resend. */
export interface SignupStart {
  verification_id: string;
  email: string;
  expires_in_seconds: number;
  resend_after_seconds: number;
  /** Development only, when the server has no email provider. */
  dev_code: string | null;
}

// ---- Supplier and purchase-order register -------------------------------------

export interface RegisteredSupplier {
  id: string;
  name: string;
  supplier_code: string | null;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  default_currency: string;
  payment_terms: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  open_purchase_orders: number;
  total_cases: number;
  open_cases: number;
  active_findings: number;
  exposure: Money[];
  last_activity_at: string | null;
  created_at: string;
}

export interface SupplierInput {
  name: string;
  supplier_code?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  default_currency: string;
  payment_terms?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export type PurchaseOrderStatus = "open" | "received" | "closed" | "cancelled";

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  supplier_name: string;
  po_number: string;
  order_date: string | null;
  expected_delivery_date: string | null;
  currency: string;
  total_amount: string | null;
  description: string | null;
  status: PurchaseOrderStatus;
  has_file: boolean;
  original_filename: string | null;
  size_bytes: number | null;
  case_count: number;
  latest_case_id: string | null;
  created_at: string;
}

export interface PurchaseOrderInput {
  supplier_id: string;
  po_number: string;
  order_date?: string | null;
  expected_delivery_date?: string | null;
  currency?: string | null;
  total_amount?: string | null;
  description?: string | null;
  status?: PurchaseOrderStatus;
}

export interface SearchHit {
  kind: "case" | "supplier" | "purchase_order" | "finding" | "document";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  badge: string | null;
}

/** A step Warden proposes. Nothing runs until the person clicks it. */
export interface WardenAction {
  type: "open_case" | "run_analysis" | "draft_letter";
  case_id: string;
  case_number: string;
  label: string;
}

/** Result of filing one document through smart intake. Mirrors IntakeOut. */
export interface IntakeResult {
  case_id: string;
  case_number: string;
  created: boolean;
  matched_by: "open_case" | "purchase_order" | "supplier" | "document";
  document_id: string;
  document_type: DocumentType;
  reference: string | null;
  supplier_name: string | null;
  missing: DocumentType[];
  analysis_started: boolean;
  message: string;
}
