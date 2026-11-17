import { PlanningError } from '../../src/domain/planning/errors';
import { requiredPermission, transitionMonth, type MonthAction, type MonthStatus } from '../../src/domain/planning/month-status';

describe('transitionMonth (FR-002)', () => {
  it('allows Draft → Active → Closed → Active', () => {
    expect(transitionMonth('draft', 'activate')).toBe('active');
    expect(transitionMonth('active', 'close')).toBe('closed');
    expect(transitionMonth('closed', 'reopen')).toBe('active');
  });

  const statuses: MonthStatus[] = ['draft', 'active', 'closed'];
  const actions: MonthAction[] = ['activate', 'close', 'reopen'];
  const allowed = new Set(['draft:activate', 'active:close', 'closed:reopen']);

  for (const from of statuses)
    for (const action of actions)
      if (!allowed.has(`${from}:${action}`))
        it(`refuses ${action} from ${from}`, () => {
          try {
            transitionMonth(from, action);
            throw new Error('should have thrown');
          } catch (e) {
            expect((e as PlanningError).code).toBe('INVALID_TRANSITION');
          }
        });
});

describe('requiredPermission (FR-003)', () => {
  it('maps actions to permissions', () => {
    expect(requiredPermission('activate')).toBe('months.activate');
    expect(requiredPermission('close')).toBe('months.close');
    expect(requiredPermission('reopen')).toBe('months.reopen');
  });
});
