import { canInvite, isIncludedInMonth, MAX_PEOPLE } from '../src/domain/membership';

const november = { start: '2026-11-01', end: '2026-11-30' };
const december = { start: '2026-12-01', end: '2026-12-31' };

describe('isIncludedInMonth (FR-033)', () => {
  it('includes a current member who joined before the month ends', () => {
    expect(isIncludedInMonth({ role: 'member', joinedOn: '2026-11-20', leftOn: null }, november)).toBe(true);
  });

  it('never includes a viewer', () => {
    expect(isIncludedInMonth({ role: 'viewer', joinedOn: '2026-01-01', leftOn: null }, november)).toBe(false);
  });

  it('excludes someone who joined after the month ended', () => {
    expect(isIncludedInMonth({ role: 'member', joinedOn: '2026-12-01', leftOn: null }, november)).toBe(false);
  });

  it('keeps someone who left on the 16th in that month and drops them from the next', () => {
    const m = { role: 'admin' as const, joinedOn: '2026-01-01', leftOn: '2026-11-16' };
    expect(isIncludedInMonth(m, november)).toBe(true);
    expect(isIncludedInMonth(m, december)).toBe(false);
  });

  it('includes someone who left on the first day of the month', () => {
    expect(isIncludedInMonth({ role: 'owner', joinedOn: '2026-01-01', leftOn: '2026-11-01' }, november)).toBe(true);
  });
});

describe('canInvite (FR-023)', () => {
  it('allows up to six people, members plus pending invitations', () => {
    expect(MAX_PEOPLE).toBe(6);
    expect(canInvite({ currentMembers: 2, pendingInvitations: 3 })).toBe(true);
    expect(canInvite({ currentMembers: 4, pendingInvitations: 2 })).toBe(false);
    expect(canInvite({ currentMembers: 6, pendingInvitations: 0 })).toBe(false);
  });
});
