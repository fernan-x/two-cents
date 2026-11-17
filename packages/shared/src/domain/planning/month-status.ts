import type { Permission } from '../permissions';
import { PlanningError } from './errors';

export const MONTH_STATUSES = ['draft', 'active', 'closed'] as const;
export type MonthStatus = (typeof MONTH_STATUSES)[number];

export const MONTH_ACTIONS = ['activate', 'close', 'reopen'] as const;
export type MonthAction = (typeof MONTH_ACTIONS)[number];

const TRANSITIONS: Record<MonthAction, { from: MonthStatus; to: MonthStatus; permission: Permission }> = {
  activate: { from: 'draft', to: 'active', permission: 'months.activate' },
  close: { from: 'active', to: 'closed', permission: 'months.close' },
  reopen: { from: 'closed', to: 'active', permission: 'months.reopen' },
};

/** Draft → Active → Closed → (reopen) Active; nothing else (FR-002). */
export function transitionMonth(from: MonthStatus, action: MonthAction): MonthStatus {
  const t = TRANSITIONS[action];
  if (!t || t.from !== from) throw new PlanningError('INVALID_TRANSITION');
  return t.to;
}

/** Who may perform a status change (FR-003). */
export function requiredPermission(action: MonthAction): Permission {
  return TRANSITIONS[action].permission;
}
