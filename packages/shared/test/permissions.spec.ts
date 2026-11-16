import { can, canManageTarget, PERMISSIONS, type Permission, type Role } from '../src/domain/permissions';

// The matrix from data-model.md, row by row: owner, admin, member, viewer.
const MATRIX: Record<Permission, [boolean, boolean, boolean, boolean]> = {
  'budget.read': [true, true, true, true],
  'budget.settings.edit': [true, true, false, false],
  'budget.delete': [true, false, false, false],
  'budget.restore': [true, false, false, false],
  'invitations.manage': [true, true, false, false],
  'members.manage': [true, true, false, false],
  'ownership.transfer': [true, false, false, false],
  'entries.write': [true, true, true, false],
  'income.write.own': [true, true, true, false],
  'membership.leave': [false, true, true, true],
};
const ROLES: Role[] = ['owner', 'admin', 'member', 'viewer'];

describe('can (FR-026)', () => {
  it('covers every permission', () => {
    expect([...PERMISSIONS].sort()).toEqual(Object.keys(MATRIX).sort());
  });

  for (const [permission, row] of Object.entries(MATRIX)) {
    ROLES.forEach((role, i) => {
      it(`${role} ${row[i] ? 'can' : 'cannot'} ${permission}`, () => {
        expect(can(role, permission as Permission)).toBe(row[i]);
      });
    });
  }
});

describe('canManageTarget (FR-027, FR-029)', () => {
  it('never lets anyone change or remove the owner', () => {
    expect(canManageTarget('owner', 'owner')).toBe(false);
    expect(canManageTarget('admin', 'owner')).toBe(false);
  });

  it('lets an owner or admin manage admins, members and viewers', () => {
    for (const actor of ['owner', 'admin'] as const) {
      for (const target of ['admin', 'member', 'viewer'] as const) {
        expect(canManageTarget(actor, target)).toBe(true);
      }
    }
  });

  it('never lets a member or viewer manage anyone', () => {
    expect(canManageTarget('member', 'viewer')).toBe(false);
    expect(canManageTarget('viewer', 'member')).toBe(false);
  });
});
