import { dehydrate, hydrate, onlineManager, QueryClient } from '@tanstack/react-query';
import type { MonthDetail, TransactionView } from '@two-cents/shared/contracts';

import { trackingApi } from './api';
import { localTracking } from './local-tracking';
import { type CreateVars, type ListData, pendingRow, registerTrackingMutations, runTrackingMutation, trackingMutations } from './mutations';
import { trackingKeys } from './query-keys';

jest.mock('./api', () => ({ trackingApi: { putTransaction: jest.fn(), deleteTransaction: jest.fn() } }));

const BUDGET = 'b';
const START = '2026-11-01';

const vars = (txnId: string, amountMinor: string, lineId: string | null = 'courses'): CreateVars => ({
  budgetId: BUDGET,
  monthStart: START,
  txnId,
  currency: 'EUR',
  body: {
    date: '2026-11-10',
    amountMinor,
    label: 'Leclerc',
    payer: { kind: 'joint' },
    parts: lineId ? [{ lineId, amountMinor }] : [],
    origin: 'quick_add',
  },
});

const clients: QueryClient[] = [];

function newClient() {
  // No garbage-collection timers: they would keep Jest running after the test.
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  registerTrackingMutations(client);
  client.setQueryData<ListData>(trackingKeys.transactions(BUDGET, START), { monthStart: START, revision: '1', transactions: [] });
  return client;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('offline queue (US3, research R3)', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    for (const c of clients.splice(0)) c.clear();
  });

  it('keeps writes made offline, survives a restart, and sends each once when back online', async () => {
    const put = trackingApi.putTransaction as jest.Mock;
    put.mockImplementation((_b: string, id: string) => Promise.resolve({ ...pendingRow(vars(id, "4230")), _pending: undefined } as unknown as TransactionView));
    onlineManager.setOnline(false);
    const before = newClient();
    void runTrackingMutation(before, 'create', vars('t1', '4230')).catch(() => undefined);
    void runTrackingMutation(before, 'create', vars('t2', '1000')).catch(() => undefined);
    await flush();

    const rows = before.getQueryData<ListData>(trackingKeys.transactions(BUDGET, START))!.transactions;
    expect(rows.map((r) => [r.id, r._pending]).sort()).toEqual([
      ['t1', true],
      ['t2', true],
    ]);
    expect(trackingMutations(before).pending).toHaveLength(2);
    expect(put).not.toHaveBeenCalled();

    // App closed and reopened offline: the queue comes back from storage.
    const state = JSON.parse(JSON.stringify(dehydrate(before, { shouldDehydrateMutation: () => true })));
    const after = newClient();
    hydrate(after, state);
    expect(trackingMutations(after).pending).toHaveLength(2);

    onlineManager.setOnline(true);
    await after.resumePausedMutations();
    await flush();
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls.map((c) => c[1]).sort()).toEqual(['t1', 't2']);
    expect(trackingMutations(after).pending).toHaveLength(0);
  });

  it('counts pending rows in the figures shown on the device, with the shared functions', () => {
    const month = {
      month: { start: START, end: '2026-11-30', status: 'active', revision: '1', createdFrom: 'scratch', activatedAt: null, closedAt: null },
      currency: 'EUR',
      members: [{ membershipId: 'm', displayName: 'M', formerMember: false, isMe: true, order: 0 }],
      incomes: [],
      lines: [
        { id: 'courses', seriesId: 's', group: 'recurring_shared', kind: 'expense', label: 'Courses', categoryId: null, isEnvelope: true, subItems: [], ownerMembershipId: null, isPrivate: false, splitMode: 'custom', payerMembershipId: null, totalMinor: '40000', shares: [{ membershipId: 'm', amountMinor: '40000' }], formula: null, position: 0, version: 1, isException: false, usualTotalMinor: null, needsReview: false, needsIncome: false, editable: true },
      ],
      privateAggregates: [],
      summary: {} as MonthDetail['summary'],
      actuals: null,
      flags: { incomesToConfirm: [], linesNeedReview: [], linesNeedIncome: [] },
      can: { editShared: true, changeStatus: [] },
    } as MonthDetail;
    const view = localTracking(month, [pendingRow(vars('a', '33000'))], undefined);
    expect(view.lines[0].envelope).toMatchObject({ spent: '33000', level: 'warning', progressPermille: 825 });
    expect(view.month.actual).toBe('33000');
  });
});
