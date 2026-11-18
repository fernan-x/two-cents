/** TanStack Query keys for spec 004, per budget. Everything under `tracking` is persisted offline (R3). */
export const trackingKeys = {
  all: (budgetId: string) => ['budgets', budgetId, 'tracking'] as const,
  transactions: (budgetId: string, monthStart: string) =>
    ['budgets', budgetId, 'tracking', 'transactions', monthStart] as const,
  tracking: (budgetId: string, monthStart: string) => ['budgets', budgetId, 'tracking', 'view', monthStart] as const,
  hints: (budgetId: string) => ['budgets', budgetId, 'tracking', 'hints'] as const,
  recurring: (budgetId: string) => ['budgets', budgetId, 'tracking', 'recurring'] as const,
};

/** Whether a query key belongs to spec 004 (persisted for offline use). */
export const isTrackingKey = (key: readonly unknown[]): boolean => key[0] === 'budgets' && key[2] === 'tracking';
