import type { Role } from "./types";

/**
 * Mirror of backend/app/core/permissions.py, used only to decide which
 * controls to show. The backend re-checks every action.
 */
export type Permission =
  | "create_case"
  | "upload_document"
  | "correct_fields"
  | "review_finding"
  | "generate_recommendation"
  | "request_approval"
  | "decide_approval"
  | "execute_action"
  | "manage_register"
  | "manage_workspace";

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    "create_case",
    "upload_document",
    "correct_fields",
    "review_finding",
    "generate_recommendation",
    "request_approval",
    "decide_approval",
    "execute_action",
    "manage_register",
    "manage_workspace",
  ]),
  reviewer: new Set<Permission>([
    "create_case",
    "upload_document",
    "correct_fields",
    "review_finding",
    "generate_recommendation",
    "request_approval",
    "decide_approval",
    "execute_action",
    "manage_register",
  ]),
  contributor: new Set<Permission>(["create_case", "upload_document", "correct_fields"]),
};

export function can(role: Role | undefined, permission: Permission): boolean {
  return role ? MATRIX[role].has(permission) : false;
}

export const ROLE_DESCRIPTIONS: Record<Role, { label: string; summary: string; abilities: string[] }> = {
  admin: {
    label: "Admin",
    summary: "Full access, including workspace management and workspace-wide activity.",
    abilities: ["Create and edit cases", "Review findings", "Approve and execute actions", "Manage workspace"],
  },
  reviewer: {
    label: "Reviewer",
    summary: "Investigates cases and approves supplier communication.",
    abilities: ["Create and edit cases", "Review findings", "Approve and execute actions"],
  },
  contributor: {
    label: "Contributor",
    summary: "Prepares cases and documents. Cannot approve external actions.",
    abilities: ["Create and edit cases", "Upload documents", "Correct extracted fields"],
  },
};
