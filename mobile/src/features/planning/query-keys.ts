/** TanStack Query keys for spec 003, per budget (research R4, R18). */
export const planningKeys = {
  all: (budgetId: string) => ['budgets', budgetId, 'planning'] as const,
  months: (budgetId: string) => ['budgets', budgetId, 'planning', 'months'] as const,
  month: (budgetId: string, start: string) => ['budgets', budgetId, 'planning', 'month', start] as const,
  history: (budgetId: string, start: string, all: boolean) =>
    ['budgets', budgetId, 'planning', 'history', start, all] as const,
  categories: (budgetId: string) => ['budgets', budgetId, 'planning', 'categories'] as const,
  templates: (budgetId: string) => ['budgets', budgetId, 'planning', 'templates'] as const,
};
