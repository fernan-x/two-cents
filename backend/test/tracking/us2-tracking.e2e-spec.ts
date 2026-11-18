import { randomUUID } from 'node:crypto';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import { monthUrl, seedHousehold, type Household } from '../support/planning';
import {
  NOV,
  type NovemberLines,
  recordTxn,
  seedNovemberLines,
  txnBody,
} from '../support/tracking';
import { as } from '../support/users';

/** T059: planned vs actual, envelopes, not tracked, "Paid as planned" (spec 004 US2). */
describe('US2 planned vs actual', () => {
  let e2e: E2eApp;
  let h: Household;
  let L: NovemberLines;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    L = await seedNovemberLines(e2e, h);
  });

  const onCourses = (amount: string) =>
    recordTxn(
      e2e,
      h,
      h.fabien,
      txnBody({
        amountMinor: amount,
        parts: [{ lineId: L.courses, amountMinor: amount }],
      }),
    );
  const tracking = async () =>
    (await as(e2e, h.maelle).get(monthUrl(h, NOV, '/tracking'))).body;
  const line = (t: { lines: { lineId: string }[] }, id: string) =>
    t.lines.find((l) => l.lineId === id) as unknown as Record<
      string,
      unknown
    > & { envelope: Record<string, unknown> };

  it('follows the Courses envelope through ok, warning and over budget', async () => {
    await onCourses('25000');
    expect(line(await tracking(), L.courses).envelope).toMatchObject({
      spent: '25000',
      remaining: '15000',
      progressPermille: 625,
      level: 'ok',
    });
    await onCourses('8000');
    expect(line(await tracking(), L.courses).envelope).toMatchObject({
      spent: '33000',
      progressPermille: 825,
      level: 'warning',
    });
    await onCourses('9000');
    expect(line(await tracking(), L.courses)).toMatchObject({
      actual: '42000',
      difference: '2000',
      differencePermille: 50,
      envelope: { remaining: '0', over: '2000', level: 'over' },
    });
  });

  it('counts lines without transactions as not tracked and keeps unassigned apart', async () => {
    await onCourses('25000');
    await recordTxn(e2e, h, h.fabien, txnBody({ amountMinor: '1000' }));
    const t = await tracking();
    expect(line(t, L.loyer)).toMatchObject({ actual: null, difference: null });
    expect(t.unassigned).toEqual({
      actual: '1000',
      txnCount: 1,
      needsReviewCount: 0,
    });
    const shared = t.groups.find(
      (g: { group: string }) => g.group === 'recurring_shared',
    ).totals;
    expect(shared).toMatchObject({
      plannedTracked: '40000',
      actual: '25000',
      difference: '-15000',
      notTrackedCount: 2,
    });
    expect(t.month).toMatchObject({ actual: '26000', plannedTracked: '40000' });
  });

  it('records "Paid as planned" once, as an ordinary transaction', async () => {
    const txnId = randomUUID();
    const url = monthUrl(h, NOV, `/lines/${L.loyer}/paid-as-planned`);
    const first = await as(e2e, h.maelle).post(url, { txnId });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      amountMinor: '95000',
      label: 'Loyer',
      date: '2026-11-16',
      payer: { kind: 'joint' },
      paymentMethod: 'transfer',
      isPlanned: true,
      origin: 'paid_as_planned',
    });
    const replay = await as(e2e, h.maelle).post(url, { txnId });
    expect(replay.status).toBe(200);
    expect(line(await tracking(), L.loyer)).toMatchObject({
      actual: '95000',
      difference: '0',
    });
  });

  it('pays a personal line as its owner by personal card, and refuses others', async () => {
    const mine = await as(e2e, h.fabien).post(
      monthUrl(h, NOV, `/lines/${L.phoneF}/paid-as-planned`),
      { txnId: randomUUID() },
    );
    expect(mine.body).toMatchObject({
      payer: { kind: 'member', membershipId: h.f },
      paymentMethod: 'personal_card',
    });
    const theirs = await as(e2e, h.maelle).post(
      monthUrl(h, NOV, `/lines/${L.phoneF}/paid-as-planned`),
      { txnId: randomUUID() },
    );
    expect(theirs.status).toBe(403);
  });

  it('shows sub-item spending in the envelope', async () => {
    await recordTxn(
      e2e,
      h,
      h.fabien,
      txnBody({
        amountMinor: '3000',
        parts: [
          {
            lineId: L.animalerie,
            subItemId: L.croquettes,
            amountMinor: '3000',
          },
        ],
      }),
    );
    expect(line(await tracking(), L.animalerie).envelope.subItems).toEqual([
      { subItemId: L.croquettes, spent: '3000', remaining: '5000' },
      expect.objectContaining({ spent: '0', remaining: null }),
    ]);
  });

  it('keeps tracking readable once the month is closed', async () => {
    await onCourses('25000');
    await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
      action: 'activate',
    });
    await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
      action: 'close',
    });
    const t = await tracking();
    expect(t.status).toBe('closed');
    expect(line(t, L.courses).actual).toBe('25000');
  });
});
