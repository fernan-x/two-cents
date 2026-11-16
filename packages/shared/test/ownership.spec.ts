import { pickNewOwner } from '../src/domain/ownership';

const m = (id: string, role: 'admin' | 'member' | 'viewer', joinedAt: string) => ({
  membershipId: id,
  role,
  joinedAt: new Date(joinedAt),
});

describe('pickNewOwner', () => {
  it('picks the oldest Admin', () => {
    const members = [m('a', 'member', '2026-01-01'), m('b', 'admin', '2026-03-01'), m('c', 'admin', '2026-02-01')];
    expect(pickNewOwner(members)?.membershipId).toBe('c');
  });
  it('falls back to the oldest member when there is no Admin', () => {
    const members = [m('a', 'viewer', '2026-04-01'), m('b', 'member', '2026-02-01')];
    expect(pickNewOwner(members)?.membershipId).toBe('b');
  });
  it('breaks ties by membership id', () => {
    const members = [m('z', 'admin', '2026-01-01'), m('k', 'admin', '2026-01-01')];
    expect(pickNewOwner(members)?.membershipId).toBe('k');
  });
  it('returns null when nobody is left', () => {
    expect(pickNewOwner([])).toBeNull();
  });
});
