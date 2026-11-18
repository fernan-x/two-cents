export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'budget.read',
  'budget.settings.edit',
  'budget.delete',
  'budget.restore',
  'invitations.manage',
  'members.manage',
  'ownership.transfer',
  'entries.write',
  'income.write.own',
  'membership.leave',
  'months.create',
  'months.activate',
  'months.close',
  'months.reopen',
  'transactions.read',
  'transactions.write',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALLOWED: Record<Permission, readonly Role[]> = {
  'budget.read': ['owner', 'admin', 'member', 'viewer'],
  'budget.settings.edit': ['owner', 'admin'],
  'budget.delete': ['owner'],
  'budget.restore': ['owner'],
  'invitations.manage': ['owner', 'admin'],
  'members.manage': ['owner', 'admin'],
  'ownership.transfer': ['owner'],
  'entries.write': ['owner', 'admin', 'member'],
  'income.write.own': ['owner', 'admin', 'member'],
  'membership.leave': ['admin', 'member', 'viewer'],
  'months.create': ['owner', 'admin', 'member'],
  'months.activate': ['owner', 'admin', 'member'],
  'months.close': ['owner', 'admin', 'member'],
  'months.reopen': ['owner', 'admin'],
  'transactions.read': ['owner', 'admin', 'member', 'viewer'],
  'transactions.write': ['owner', 'admin', 'member'],
};

/** The permission matrix (FR-026, data-model.md), used by the API guard and to hide controls in the app. */
export function can(role: Role, permission: Permission): boolean {
  return ALLOWED[permission].includes(role);
}

/** Whether `actor` may change the role of, or remove, `target` (FR-027, FR-029): never the owner. */
export function canManageTarget(actor: Role, target: Role): boolean {
  return target !== 'owner' && can(actor, 'members.manage');
}
