import type { BudgetSummary } from '@two-cents/shared/contracts';

/**
 * The budget to open (FR-036): the most recently opened one the person still belongs to, or null for
 * the "create or join a budget" screen. The server already drops deleted and left budgets.
 */
export function pickActiveBudget(budgets: readonly BudgetSummary[]): BudgetSummary | null {
  if (budgets.length === 0) return null;
  return [...budgets].sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''))[0];
}
