import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/** Supplier email being edited for a case, kept across navigation in-session. */
export interface EmailDraftState {
  recommendationId: string;
  subject: string;
  body: string;
  recipient: string;
  recipientVerified: boolean;
  /** Set once submitted; editing afterwards requires a fresh draft. */
  submittedApprovalId: string | null;
  /** Model that rephrased the draft, or null for the deterministic template. */
  aiModel: string | null;
}

type DraftsState = Record<string, EmailDraftState>;

export const draftsSlice = createSlice({
  name: "drafts",
  initialState: {} as DraftsState,
  reducers: {
    draftStarted(
      state,
      action: PayloadAction<{ caseId: string; recommendationId: string; subject: string; body: string; recipient: string | null; aiModel: string | null }>,
    ) {
      const { caseId, recommendationId, subject, body, recipient, aiModel } = action.payload;
      state[caseId] = { recommendationId, subject, body, recipient: recipient ?? "", recipientVerified: false, submittedApprovalId: null, aiModel };
    },
    draftEdited(state, action: PayloadAction<{ caseId: string; changes: Partial<Pick<EmailDraftState, "subject" | "body" | "recipient" | "recipientVerified">> }>) {
      const d = state[action.payload.caseId];
      if (!d || d.submittedApprovalId) return;
      Object.assign(d, action.payload.changes);
      if ("recipient" in action.payload.changes) d.recipientVerified = false;
    },
    draftSubmitted(state, action: PayloadAction<{ caseId: string; approvalId: string }>) {
      const d = state[action.payload.caseId];
      if (d) d.submittedApprovalId = action.payload.approvalId;
    },
    draftDiscarded(state, action: PayloadAction<string>) {
      delete state[action.payload];
    },
  },
});

export const { draftStarted, draftEdited, draftSubmitted, draftDiscarded } = draftsSlice.actions;
