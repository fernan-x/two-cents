import { computeDeletionDate, DELETION_GRACE_MS } from '../src/domain/deletion';

describe('computeDeletionDate', () => {
  it('adds exactly 7 × 24 h', () => {
    expect(DELETION_GRACE_MS).toBe(7 * 86_400_000);
    expect(computeDeletionDate(new Date('2026-11-16T10:00:00Z'))).toEqual(new Date('2026-11-23T10:00:00Z'));
  });
  it('is unaffected by the Europe/Paris DST change', () => {
    // DST ends on 2026-10-25 in Europe/Paris.
    expect(computeDeletionDate(new Date('2026-10-22T10:00:00Z'))).toEqual(new Date('2026-10-29T10:00:00Z'));
  });
});
