import { BudgetMonth } from '../../domain/entities/budget-month';
import type { ChangeRecord } from '../../domain/ports/repositories';
import { MonthWriter } from './month-writer';

const now = new Date('2026-11-16T10:00:00Z');
const ME = 'me-membership';

function setup(status: 'draft' | 'closed' = 'draft') {
  const month = BudgetMonth.create({
    id: 'month-1',
    budgetId: 'budget-1',
    period: { start: '2026-11-01', end: '2026-11-30' },
    createdFrom: 'scratch',
    by: ME,
    now,
  });
  if (status === 'closed') {
    month.changeStatus('activate', ME, now);
    month.changeStatus('close', ME, now, {});
  }
  const me = {
    id: ME,
    joinedAt: new Date('2026-01-01'),
    forMonth: () => ({ role: 'member', joinedOn: '2026-01-01', leftOn: null }),
  };
  const budget = { id: 'budget-1', timeZone: 'Europe/Paris', currency: 'EUR' };
  const records: ChangeRecord[] = [];
  const bumps: string[] = [];
  let ids = 0;
  const writer = new MonthWriter(
    { require: () => Promise.resolve({ budget, membership: me }) } as never,
    { listByBudget: () => Promise.resolve([me]) } as never,
    {
      findByStart: () => Promise.resolve(month),
      findById: () => Promise.resolve(month),
      save: () => Promise.resolve(),
      bumpRevision: (id: string) => {
        bumps.push(id);
        return Promise.resolve(1n);
      },
    } as never,
    { listForMonth: () => Promise.resolve([]) } as never,
    { listForMonth: () => Promise.resolve([]) } as never,
    {
      record: (c: ChangeRecord) => {
        records.push(c);
        return Promise.resolve();
      },
    } as never,
    { run: <T>(work: () => Promise<T>) => work() } as never,
    { now: () => now },
    { next: () => `id-${++ids}` },
    { build: () => Promise.resolve({ built: true }) } as never,
  );
  return { writer, records, bumps };
}

const auth = { userId: 'user-1' } as never;

describe('MonthWriter (research R4, R5, R11)', () => {
  it('refuses writes to a closed month', async () => {
    const { writer } = setup('closed');
    await expect(
      writer.write(auth, 'budget-1', '2026-11-01', 'entries.write', () =>
        Promise.resolve(),
      ),
    ).rejects.toMatchObject({ code: 'MONTH_CLOSED' });
  });

  it('lets a reopen through on a closed month', async () => {
    const { writer } = setup('closed');
    await expect(
      writer.write(
        auth,
        'budget-1',
        '2026-11-01',
        'months.reopen',
        () => Promise.resolve(),
        {
          allowClosed: true,
        },
      ),
    ).resolves.toEqual({ built: true });
  });

  it('bumps the revision once per write and records history with the month status', async () => {
    const { writer, records, bumps } = setup();
    await writer.write(
      auth,
      'budget-1',
      '2026-11-01',
      'entries.write',
      async (ctx) => {
        expect(ctx.members.map((m) => m.id)).toEqual([ME]);
        await ctx.record({
          entity: 'line',
          entityId: 'l',
          action: 'created',
          isPrivate: false,
          ownerMembershipId: null,
          labelSnapshot: 'Courses',
          changes: [],
        });
        await ctx.record({
          entity: 'line',
          entityId: 'l2',
          action: 'created',
          isPrivate: false,
          ownerMembershipId: null,
          labelSnapshot: 'Loyer',
          changes: [],
        });
      },
    );
    expect(bumps).toEqual(['month-1']);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      monthId: 'month-1',
      monthStatus: 'draft',
      actorMembershipId: ME,
      cause: 'user',
      createdAt: now,
    });
  });
});
