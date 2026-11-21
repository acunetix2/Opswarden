/**
 * RTK Query API slice for the OpsWarden backend (`/api/v1`).
 *
 * All server state flows through here. Cache tags keep views consistent: a
 * mutation invalidates exactly the data it can change (e.g. approving an
 * action refreshes the approvals list, the case, the dashboard, and activity).
 *
 * Authorization is enforced by the backend. Role-based UI hiding is a
 * convenience only.
 */
import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs } from "@reduxjs/toolkit/query/react";

import { fromFetchError, type AppError } from "@/lib/api-error";
import type {
  ActivityEvent,
  Approval,
  ApprovalStatus,
  Case,
  CaseCreate,
  CaseSummary,
  Comparison,
  DocumentMeta,
  DocumentType,
  EmailDraft,
  ExecuteResult,
  ExtractionReview,
  FieldCorrection,
  Finding,
  FindingDecision,
  Member,
  Overview,
  Page,
  Invitation,
  InvitationLookup,
  Notifications,
  Role,
  Supplier,
  User,
  Workspace,
  WorkspaceDocument,
  WorkspaceFinding,
  WorkspaceSettings,
  WorkspaceSettingsUpdate,
} from "@/lib/types";

import { refreshSession, usesSupabaseAuth } from "@/lib/supabase-auth";

import { signedOut, tokenRefreshed } from "./session-slice";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8099").replace(/\/$/, "");

interface TokenState {
  session: { token: string | null };
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${API_URL}/api/v1`,
  prepareHeaders(headers, { getState }) {
    const token = (getState() as TokenState).session.token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");
    return headers;
  },
});

/**
 * Normalizes errors to AppError. On 401 with Supabase Auth it first tries to
 * renew the short-lived access token once and replays the request; only if
 * that fails is the user signed out.
 */
const baseQuery: BaseQueryFn<string | FetchArgs, unknown, AppError> = async (args, api, extra) => {
  let result = await rawBaseQuery(args, api, extra);
  const hadToken = Boolean((api.getState() as TokenState).session.token);
  if (result.error?.status === 401 && hadToken && usesSupabaseAuth) {
    const renewed = await refreshSession();
    if (renewed) {
      api.dispatch(tokenRefreshed(renewed.access_token));
      result = await rawBaseQuery(args, api, extra);
    }
  }
  if (result.error) {
    if (result.error.status === 401 && hadToken) api.dispatch(signedOut());
    return { error: fromFetchError(result.error) };
  }
  return { data: result.data };
};

type CaseScoped = { caseId: string };

export const opswardenApi = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: [
    "Me",
    "Workspaces",
    "Overview",
    "CaseList",
    "Case",
    "CaseData",
    "CaseDocuments",
    "WorkspaceDocuments",
    "Extraction",
    "Approvals",
    "Activity",
    "Members",
    "Settings",
    "Suppliers",
    "Invitations",
    "Notifications",
  ],
  endpoints: (build) => ({
    // ---- Auth & workspace ---------------------------------------------------
    login: build.mutation<{ access_token: string }, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
    }),
    requestPasswordReset: build.mutation<{ message: string; dev_reset_url: string | null }, { email: string }>({
      query: (body) => ({ url: "/auth/password-reset/request", method: "POST", body }),
    }),
    confirmPasswordReset: build.mutation<{ access_token: string }, { token: string; new_password: string }>({
      query: (body) => ({ url: "/auth/password-reset/confirm", method: "POST", body }),
    }),
    me: build.query<User, void>({ query: () => "/auth/me", providesTags: ["Me"] }),
    workspaces: build.query<Workspace[], void>({ query: () => "/workspaces", providesTags: ["Workspaces"] }),
    overview: build.query<Overview, { workspaceId: string; days: number }>({
      query: ({ workspaceId, days }) => ({ url: `/workspaces/${workspaceId}/overview`, params: { days } }),
      providesTags: ["Overview"],
    }),
    members: build.query<Member[], string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/members`,
      providesTags: ["Members"],
    }),
    settings: build.query<WorkspaceSettings, string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/settings`,
      providesTags: ["Settings"],
    }),
    updateSettings: build.mutation<WorkspaceSettings, { workspaceId: string; body: WorkspaceSettingsUpdate }>({
      query: ({ workspaceId, body }) => ({ url: `/workspaces/${workspaceId}/settings`, method: "PATCH", body }),
      invalidatesTags: ["Settings", "Workspaces", "Activity"],
    }),

    // ---- Team ---------------------------------------------------------------------
    invitations: build.query<Invitation[], string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/invitations`,
      providesTags: ["Invitations"],
    }),
    createInvitation: build.mutation<Invitation, { workspaceId: string; email: string; role: Role }>({
      query: ({ workspaceId, ...body }) => ({ url: `/workspaces/${workspaceId}/invitations`, method: "POST", body }),
      invalidatesTags: ["Invitations", "Activity"],
    }),
    revokeInvitation: build.mutation<void, string>({
      query: (id) => ({ url: `/invitations/${id}`, method: "DELETE" }),
      invalidatesTags: ["Invitations", "Activity"],
    }),
    lookupInvitation: build.query<InvitationLookup, string>({
      query: (token) => ({ url: "/invitations/lookup", params: { token } }),
    }),
    /** Supabase Auth: a signed-in user redeems an invitation for their own email. */
    claimInvitation: build.mutation<{ workspace_id: string }, string>({
      query: (token) => ({ url: "/invitations/claim", method: "POST", body: { token } }),
      invalidatesTags: ["Workspaces"],
    }),
    acceptInvitation: build.mutation<{ access_token: string; workspace_id: string }, { token: string; password: string; full_name?: string }>({
      query: (body) => ({ url: "/invitations/accept", method: "POST", body }),
    }),
    updateMemberRole: build.mutation<void, { workspaceId: string; userId: string; role: Role }>({
      query: ({ workspaceId, userId, role }) => ({ url: `/workspaces/${workspaceId}/members/${userId}`, method: "PATCH", body: { role } }),
      invalidatesTags: ["Members", "Activity"],
    }),
    removeMember: build.mutation<void, { workspaceId: string; userId: string }>({
      query: ({ workspaceId, userId }) => ({ url: `/workspaces/${workspaceId}/members/${userId}`, method: "DELETE" }),
      invalidatesTags: ["Members", "Activity"],
    }),
    memberResetLink: build.mutation<{ reset_url: string; expires_in_minutes: number }, { workspaceId: string; userId: string }>({
      query: ({ workspaceId, userId }) => ({ url: `/workspaces/${workspaceId}/members/${userId}/password-reset`, method: "POST" }),
      invalidatesTags: ["Activity"],
    }),

    // ---- Notifications ---------------------------------------------------------------
    notifications: build.query<Notifications, string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/notifications`,
      providesTags: ["Notifications"],
    }),
    markNotificationsRead: build.mutation<void, string>({
      query: (workspaceId) => ({ url: `/workspaces/${workspaceId}/notifications/mark-read`, method: "POST" }),
      invalidatesTags: ["Notifications"],
    }),

    suppliers: build.query<Supplier[], string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/suppliers`,
      providesTags: ["Suppliers"],
    }),

    // ---- Cases ---------------------------------------------------------------
    cases: build.query<Case[], { workspaceId: string; search?: string; status?: string; owner_id?: string; include_archived?: boolean }>({
      query: ({ workspaceId, ...params }) => ({
        url: `/workspaces/${workspaceId}/cases`,
        params: Object.fromEntries(Object.entries({ ...params, limit: 200 }).filter(([, v]) => v)),
      }),
      providesTags: ["CaseList"],
    }),
    createCase: build.mutation<Case, { workspaceId: string; body: CaseCreate }>({
      query: ({ workspaceId, body }) => ({ url: `/workspaces/${workspaceId}/cases`, method: "POST", body }),
      invalidatesTags: ["CaseList", "Overview", "Suppliers", "Activity"],
    }),
    updateCase: build.mutation<Case, CaseScoped & { body: Partial<CaseCreate> }>({
      query: ({ caseId, body }) => ({ url: `/cases/${caseId}`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { caseId }) => [{ type: "Case", id: caseId }, "CaseList", "Suppliers", "Activity"],
    }),
    getCase: build.query<Case, string>({
      query: (caseId) => `/cases/${caseId}`,
      providesTags: (_r, _e, caseId) => [{ type: "Case", id: caseId }],
    }),
    archiveCase: build.mutation<Case, CaseScoped & { reason?: string }>({
      query: ({ caseId, reason }) => ({ url: `/cases/${caseId}/archive`, method: "POST", body: { reason } }),
      invalidatesTags: (_r, _e, { caseId }) => [{ type: "Case", id: caseId }, "CaseList", "Overview", "Suppliers", "Approvals", "Activity"],
    }),
    reopenCase: build.mutation<Case, CaseScoped & { reason?: string }>({
      query: ({ caseId, reason }) => ({ url: `/cases/${caseId}/reopen`, method: "POST", body: { reason } }),
      invalidatesTags: (_r, _e, { caseId }) => [{ type: "Case", id: caseId }, { type: "CaseData", id: caseId }, "CaseList", "Overview", "Suppliers", "Activity"],
    }),
    analyze: build.mutation<{ case_id: string; status: string; run_id: string | null }, string>({
      query: (caseId) => ({ url: `/cases/${caseId}/analyze`, method: "POST" }),
      invalidatesTags: (_r, _e, caseId) => [
        { type: "Case", id: caseId },
        { type: "CaseData", id: caseId },
        { type: "CaseDocuments", id: caseId },
        "Extraction",
        "CaseList",
        "Overview",
        "Suppliers",
        "WorkspaceDocuments",
        "Activity",
      ],
    }),
    resolveCase: build.mutation<Case, CaseScoped & { comment?: string }>({
      query: ({ caseId, comment }) => ({ url: `/cases/${caseId}/resolve`, method: "POST", body: { comment } }),
      invalidatesTags: (_r, _e, { caseId }) => [
        { type: "Case", id: caseId },
        { type: "CaseData", id: caseId },
        "CaseList",
        "Overview",
        "Suppliers",
        "Activity",
      ],
    }),
    summary: build.query<CaseSummary, string>({
      query: (caseId) => `/cases/${caseId}/summary`,
      providesTags: (_r, _e, caseId) => [{ type: "CaseData", id: caseId }],
    }),
    comparison: build.query<Comparison, string>({
      query: (caseId) => `/cases/${caseId}/comparison`,
      providesTags: (_r, _e, caseId) => [{ type: "CaseData", id: caseId }],
    }),

    // ---- Documents -------------------------------------------------------------
    caseDocuments: build.query<DocumentMeta[], string>({
      query: (caseId) => `/cases/${caseId}/documents`,
      providesTags: (_r, _e, caseId) => [{ type: "CaseDocuments", id: caseId }],
    }),
    workspaceDocuments: build.query<WorkspaceDocument[], string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/documents`,
      providesTags: ["WorkspaceDocuments"],
    }),
    uploadDocument: build.mutation<
      { document_id: string; processing_status: string; filename: string },
      CaseScoped & { documentType: DocumentType; file: File }
    >({
      query: ({ caseId, documentType, file }) => {
        const form = new FormData();
        form.set("document_type", documentType);
        form.set("file", file);
        return { url: `/cases/${caseId}/documents`, method: "POST", body: form };
      },
      invalidatesTags: (_r, _e, { caseId }) => [
        { type: "CaseDocuments", id: caseId },
        { type: "Case", id: caseId },
        "WorkspaceDocuments",
        "Activity",
      ],
    }),
    getDocument: build.query<WorkspaceDocument, string>({
      query: (documentId) => `/documents/${documentId}`,
      providesTags: (_r, _e, documentId) => [{ type: "Extraction", id: documentId }],
    }),
    deleteDocument: build.mutation<void, CaseScoped & { documentId: string }>({
      query: ({ documentId }) => ({ url: `/documents/${documentId}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { caseId }) => [{ type: "CaseDocuments", id: caseId }, "WorkspaceDocuments", "Activity"],
    }),
    extractedFields: build.query<ExtractionReview, string>({
      query: (documentId) => `/documents/${documentId}/extracted-fields`,
      providesTags: (_r, _e, documentId) => [{ type: "Extraction", id: documentId }],
    }),
    correctFields: build.mutation<ExtractionReview, CaseScoped & { documentId: string; corrections: FieldCorrection[] }>({
      query: ({ documentId, corrections }) => ({
        url: `/documents/${documentId}/extracted-fields`,
        method: "PATCH",
        body: { corrections },
      }),
      invalidatesTags: (_r, _e, { documentId, caseId }) => [
        { type: "Extraction", id: documentId },
        { type: "CaseData", id: caseId },
        "Activity",
      ],
    }),

    // ---- Findings ---------------------------------------------------------------
    allFindings: build.query<WorkspaceFinding[], string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/findings`,
      providesTags: ["CaseList", { type: "CaseData", id: "WORKSPACE" }],
    }),
    findings: build.query<Page<Finding>, string>({
      query: (caseId) => `/cases/${caseId}/findings`,
      providesTags: (_r, _e, caseId) => [{ type: "CaseData", id: caseId }],
    }),
    reviewFinding: build.mutation<
      Finding,
      CaseScoped & { findingId: string; decision: FindingDecision; comment?: string }
    >({
      query: ({ findingId, decision, comment }) => ({
        url: `/findings/${findingId}/review`,
        method: "POST",
        body: { decision, comment },
      }),
      invalidatesTags: (_r, _e, { caseId }) => [{ type: "CaseData", id: caseId }, { type: "CaseData", id: "WORKSPACE" }, "Overview", "Suppliers", "Activity"],
    }),

    // ---- Recommendations & approvals -------------------------------------------
    emailDraft: build.mutation<EmailDraft, string>({
      query: (caseId) => ({ url: `/cases/${caseId}/recommendations/email-draft`, method: "POST" }),
      invalidatesTags: ["Activity"],
    }),
    requestApproval: build.mutation<
      { approval_id: string; status: string; payload_hash: string },
      CaseScoped & { recommendationId: string; recipient?: string | null; subject: string; body: string }
    >({
      query: ({ recommendationId, recipient, subject, body }) => ({
        url: `/recommendations/${recommendationId}/request-approval`,
        method: "POST",
        body: { recipient: recipient || null, subject, body },
      }),
      invalidatesTags: (_r, _e, { caseId }) => [{ type: "Case", id: caseId }, "Approvals", "CaseList", "Overview", "Activity"],
    }),
    approvals: build.query<Approval[], { workspaceId: string; status?: ApprovalStatus }>({
      query: ({ workspaceId, status }) => ({
        url: `/workspaces/${workspaceId}/approvals`,
        params: status ? { status } : undefined,
      }),
      providesTags: ["Approvals"],
    }),
    decideApproval: build.mutation<Approval, { approvalId: string; decision: "approve" | "reject"; comment?: string }>({
      query: ({ approvalId, decision, comment }) => ({
        url: `/approvals/${approvalId}/decision`,
        method: "POST",
        body: { decision, comment },
      }),
      invalidatesTags: ["Approvals", "Overview", "Activity"],
    }),
    executeApproval: build.mutation<ExecuteResult, { approvalId: string; caseId: string }>({
      query: ({ approvalId }) => ({ url: `/approvals/${approvalId}/execute`, method: "POST" }),
      invalidatesTags: (_r, _e, { caseId }) => [
        { type: "Case", id: caseId },
        "Approvals",
        "CaseList",
        "Overview",
        "Suppliers",
        "Activity",
      ],
    }),

    // ---- Activity -----------------------------------------------------------------
    caseActivity: build.query<ActivityEvent[], string>({
      query: (caseId) => `/cases/${caseId}/activity`,
      providesTags: ["Activity"],
    }),
    workspaceActivity: build.query<ActivityEvent[], string>({
      query: (workspaceId) => `/workspaces/${workspaceId}/activity`,
      providesTags: ["Activity"],
    }),

    // ---- Help assistant ---------------------------------------------------------
    assistantChat: build.mutation<
      {
        reply: string | null;
        source: "model" | "builtin";
        reason?: string | null;
        model?: string | null;
        links?: { label: string; href: string }[];
      },
      {
        workspaceId: string;
        message: string;
        history: { role: "user" | "assistant"; text: string }[];
        pathname?: string;
        case_id?: string | null;
      }
    >({
      query: ({ workspaceId, ...body }) => ({ url: `/workspaces/${workspaceId}/assistant/chat`, method: "POST", body }),
    }),
  }),
});

export const {
  useClaimInvitationMutation,
  useAssistantChatMutation,
  useRequestPasswordResetMutation,
  useConfirmPasswordResetMutation,
  useUpdateSettingsMutation,
  useInvitationsQuery,
  useCreateInvitationMutation,
  useRevokeInvitationMutation,
  useLookupInvitationQuery,
  useAcceptInvitationMutation,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
  useMemberResetLinkMutation,
  useNotificationsQuery,
  useMarkNotificationsReadMutation,
  useArchiveCaseMutation,
  useReopenCaseMutation,
  useLoginMutation,
  useMeQuery,
  useWorkspacesQuery,
  useOverviewQuery,
  useMembersQuery,
  useSettingsQuery,
  useSuppliersQuery,
  useCasesQuery,
  useCreateCaseMutation,
  useUpdateCaseMutation,
  useGetCaseQuery,
  useAnalyzeMutation,
  useResolveCaseMutation,
  useSummaryQuery,
  useComparisonQuery,
  useCaseDocumentsQuery,
  useWorkspaceDocumentsQuery,
  useUploadDocumentMutation,
  useDeleteDocumentMutation,
  useGetDocumentQuery,
  useExtractedFieldsQuery,
  useCorrectFieldsMutation,
  useFindingsQuery,
  useAllFindingsQuery,
  useReviewFindingMutation,
  useEmailDraftMutation,
  useRequestApprovalMutation,
  useApprovalsQuery,
  useDecideApprovalMutation,
  useExecuteApprovalMutation,
  useCaseActivityQuery,
  useWorkspaceActivityQuery,
} = opswardenApi;
