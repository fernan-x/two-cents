import type { BudgetSummary } from '@two-cents/shared/contracts';

import { pickActiveBudget } from './active-budget';

const budget = (id: string, lastOpenedAt: string | null): BudgetSummary => ({
  id,
  name: id,
  currency: 'EUR',
  myRole: 'member',
  memberCount: 2,
  lastOpenedAt,
});

describe('pickActiveBudget (FR-036)', () => {
  it('opens the most recently used budget', () => {
    const picked = pickActiveBudget([
      budget('maison', '2026-11-10T08:00:00.000Z'),
      budget('chatterie', '2026-11-16T08:00:00.000Z'),
    ]);
    expect(picked?.id).toBe('chatterie');
  });

  it('falls back to another budget when the last one is gone', () => {
    expect(pickActiveBudget([budget('maison', null)])?.id).toBe('maison');
  });

  it('returns null with no budget, for the "create or join" screen', () => {
    expect(pickActiveBudget([])).toBeNull();
  });
});
