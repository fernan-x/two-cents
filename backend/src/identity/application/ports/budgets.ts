/** Ports this context owns and spec 002 (budgets) implements (data-model "Ports to the budgets module"). */
export interface BudgetMembershipPort {
  hasAnyBudget(userId: string): Promise<boolean>;
  cancelInvitationsSentBy(userId: string): Promise<void>;
  /** Called inside the deletion transaction: deletes sole-member budgets, transfers ownership, removes memberships. */
  finalizeMemberDeletion(userId: string): Promise<void>;
  previewMemberDeletion(userId: string): Promise<{
    budgetsDeleted: Array<{ id: string; name: string }>;
    budgetsLeft: Array<{
      id: string;
      name: string;
      newOwnerFirstName?: string;
    }>;
  }>;
}
export const BUDGET_MEMBERSHIP_PORT = Symbol('BudgetMembershipPort');

export interface BudgetExportRow {
  budgets: Array<Record<string, string | number | null>>;
  entries: Array<Record<string, string | number | null>>;
  /** Spec 004: transactions, settlements, recurring rules… one CSV each. */
  sections?: Record<
    string,
    Array<Record<string, string | number | boolean | null>>
  >;
  /** Spec 004: receipt photos, stored as files in the archive. */
  files?: Array<{ path: string; bytes: Uint8Array }>;
}

export interface BudgetExportPort {
  exportForUser(userId: string): Promise<BudgetExportRow>;
}
export const BUDGET_EXPORT_PORT = Symbol('BudgetExportPort');
