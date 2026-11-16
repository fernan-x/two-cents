import type { Role } from '@two-cents/shared/contracts';
import type { TFunction } from 'i18next';

/** Roles are always shown as words, never by color alone (Principle VIII). */
export function roleLabel(t: TFunction, role: Role): string {
  return t(`budgets.roles.${role}`);
}
