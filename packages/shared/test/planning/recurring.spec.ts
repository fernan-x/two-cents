import { needsScope, shouldPropagate } from '../../src/domain/planning/recurring';

describe('shouldPropagate (FR-025, clarification Q1 → B)', () => {
  it('only Draft months whose line was not edited by hand', () => {
    expect(shouldPropagate({ laterMonthStatus: 'draft', handEdited: false })).toBe(true);
    expect(shouldPropagate({ laterMonthStatus: 'draft', handEdited: true })).toBe(false);
    expect(shouldPropagate({ laterMonthStatus: 'active', handEdited: false })).toBe(false);
    expect(shouldPropagate({ laterMonthStatus: 'closed', handEdited: false })).toBe(false);
  });
});

describe('needsScope (FR-024)', () => {
  it('recurring lines need a scope when an amount field changes', () => {
    for (const group of ['personal', 'recurring_shared'] as const)
      for (const field of ['totalMinor', 'shares', 'splitMode', 'payerMembershipId', 'formula'])
        expect(needsScope(group, [field])).toBe(true);
  });
  it('not for other fields, nor for one-off lines', () => {
    expect(needsScope('recurring_shared', ['label', 'kind', 'categoryId', 'isEnvelope', 'isPrivate'])).toBe(false);
    expect(needsScope('one_off_shared', ['totalMinor'])).toBe(false);
  });
});
