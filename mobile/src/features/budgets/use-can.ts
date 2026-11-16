import { useQuery } from '@tanstack/react-query';
import { can, type Permission } from '@two-cents/shared/domain';

import { budgetsApi } from './api';
import { budgetKeys } from './query-keys';

/** The budget, cached per id (SC-005: switching shows the cache at once, then refreshes). */
export function useBudget(budgetId: string) {
  return useQuery({ queryKey: budgetKeys.detail(budgetId), queryFn: () => budgetsApi.get(budgetId) });
}

/**
 * Whether the signed-in person may do `permission` in this budget, from the same matrix the API
 * enforces (FR-026). Hides controls only: the server still refuses (FR-039).
 */
export function useCan(budgetId: string, permission: Permission): boolean {
  const { data } = useBudget(budgetId);
  return data ? can(data.myRole, permission) : false;
}
