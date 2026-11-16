/** TanStack Query keys for spec 002, per budget (research R13). */
export const budgetKeys = {
  all: ['budgets'] as const,
  mine: ['budgets', 'mine'] as const,
  detail: (id: string) => ['budgets', id, 'detail'] as const,
  members: (id: string) => ['budgets', id, 'members'] as const,
  invitations: (id: string) => ['budgets', id, 'invitations'] as const,
  events: (id: string) => ['budgets', id, 'events'] as const,
};
