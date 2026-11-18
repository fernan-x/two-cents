import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addIncome,
  monthUrl,
  seedHousehold,
  type Household,
} from '../support/planning';
import {
  NOV,
  type NovemberLines,
  recordTxn,
  seedNovemberLines,
  txnBody,
  txnUrl,
} from '../support/tracking';
import { as } from '../support/users';

/** T073 (US4 hints), T079 (receipts), T087 (US6 balances), T092 (US7 meal vouchers). */
describe('hints, receipts, balances and meal vouchers', () => {
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

  const hintsUrl = () => `/v1/budgets/${h.budgetId}/transaction-hints`;
  const tracking = async () =>
    (await as(e2e, h.fabien).get(monthUrl(h, NOV, '/tracking'))).body;
  const fabienPays = (
    amount: string,
    lineId: string | null,
    extra: object = {},
  ) =>
    recordTxn(
      e2e,
      h,
      h.fabien,
      txnBody({
        amountMinor: amount,
        payer: { kind: 'member', membershipId: h.f },
        parts: lineId ? [{ lineId, amountMinor: amount }] : [],
        ...extra,
      }),
    );

  describe('US4 hints', () => {
    it('counts labels by series, the caller most used lines and last methods, excluding private lines', async () => {
      for (let i = 0; i < 3; i++)
        await fabienPays('4230', L.courses, { label: 'LECLERC ' });
      await recordTxn(
        e2e,
        h,
        h.maelle,
        txnBody({
          label: 'Leclerc',
          amountMinor: '100',
          payer: { kind: 'member', membershipId: h.m },
          paymentMethod: 'cash',
          parts: [{ lineId: L.psy, amountMinor: '100' }],
        }),
      );
      const res = await as(e2e, h.fabien).get(hintsUrl());
      expect(res.status).toBe(200);
      const courses = (
        await as(e2e, h.fabien).get(monthUrl(h, NOV))
      ).body.lines.find((l: { id: string }) => l.id === L.courses);
      expect(res.body.labels).toEqual([
        expect.objectContaining({
          normalizedLabel: 'leclerc',
          seriesId: courses.seriesId,
          count: 3,
        }),
      ]);
      expect(res.body.mostUsed).toEqual([
        { seriesId: courses.seriesId, count: 3 },
      ]);
      expect(res.body.lastMethodByPayer).toEqual([
        {
          payer: { kind: 'member', membershipId: h.f },
          paymentMethod: 'personal_card',
        },
      ]);
      const again = await as(e2e, h.fabien)
        .get(hintsUrl())
        .set('If-None-Match', res.headers.etag);
      expect(again.status).toBe(304);
      const maelle = await as(e2e, h.maelle).get(hintsUrl());
      expect(maelle.body.labels.length).toBe(2);
    });

    it('leaves out transactions older than 90 days', async () => {
      await fabienPays('4230', L.courses);
      await e2e.db.execute(
        sql`UPDATE txn SET created_at = now() - interval '200 days'`,
      );
      expect((await as(e2e, h.fabien).get(hintsUrl())).body.labels).toEqual([]);
    });
  });

  describe('receipts', () => {
    const jpeg = (size: number) => {
      const b = Buffer.alloc(size, 0x11);
      b[0] = 0xff;
      b[1] = 0xd8;
      b[2] = 0xff;
      return b;
    };
    const put = (txnId: string, id: string, body: Buffer, user = h.fabien) =>
      e2e
        .client()
        .put(`${txnUrl(h, txnId)}/receipts/${id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Content-Type', 'image/jpeg')
        .send(body);

    it('stores up to 3 JPEGs of at most 1 MB, idempotently, and deletes them with the transaction', async () => {
      const { id } = await fabienPays('4230', L.courses);
      const r1 = randomUUID();
      expect((await put(id, r1, jpeg(2000))).status).toBe(201);
      expect((await put(id, r1, jpeg(2000))).status).toBe(200);
      expect((await put(id, randomUUID(), jpeg(1_048_577))).status).toBe(413);
      expect(
        (await put(id, randomUUID(), Buffer.from('not a jpeg'))).status,
      ).toBe(400);
      await put(id, randomUUID(), jpeg(10));
      await put(id, randomUUID(), jpeg(10));
      const fourth = await put(id, randomUUID(), jpeg(10));
      expect(fourth.status).toBe(409);
      expect(fourth.body.error).toBe('TOO_MANY_RECEIPTS');

      const got = await as(e2e, h.maelle).get(
        `${txnUrl(h, id)}/receipts/${r1}`,
      );
      expect(got.status).toBe(200);
      expect(got.headers['content-type']).toBe('image/jpeg');
      expect(got.headers['cache-control']).toBe('private, max-age=86400');

      await as(e2e, h.fabien).delete(`${txnUrl(h, id)}?expectedVersion=1`);
      const n = await e2e.db.execute<{ n: string }>(
        sql`SELECT count(*) AS n FROM txn_receipt`,
      );
      expect(Number(n.rows[0].n)).toBe(0);
    });

    it('hides a private-line receipt from the other member', async () => {
      const { id } = await recordTxn(
        e2e,
        h,
        h.maelle,
        txnBody({
          payer: { kind: 'member', membershipId: h.m },
          parts: [{ lineId: L.psy, amountMinor: '4230' }],
        }),
      );
      const r = randomUUID();
      expect((await put(id, r, jpeg(100), h.maelle)).status).toBe(201);
      expect(
        (await as(e2e, h.fabien).get(`${txnUrl(h, id)}/receipts/${r}`)).status,
      ).toBe(404);
    });
  });

  describe('US6 balances', () => {
    const settle = (from: string, to: string, amountMinor: string) =>
      as(e2e, h.maelle).post(monthUrl(h, NOV, '/settlements'), {
        fromMembershipId: from,
        toMembershipId: to,
        amountMinor,
      });

    it('splits by the line planned shares, settles, and reopens a balance after an edit', async () => {
      const { id } = await fabienPays('10447', L.courses);
      expect((await tracking()).balances).toEqual([
        { from: h.m, to: h.f, amountMinor: '2612' },
      ]);
      expect((await settle(h.m, h.f, '9999')).body.error).toBe(
        'SETTLEMENT_EXCEEDS_BALANCE',
      );
      const ok = await settle(h.m, h.f, '2612');
      expect(ok.status).toBe(201);
      expect((await tracking()).balances).toEqual([]);
      await as(e2e, h.fabien).patch(txnUrl(h, id), {
        expectedVersion: 1,
        amountMinor: '12000',
      });
      const t = await tracking();
      expect(t.balances).toEqual([{ from: h.m, to: h.f, amountMinor: '388' }]);
      expect(t.settlements).toEqual([
        expect.objectContaining({ from: h.m, to: h.f, amountMinor: '2612' }),
      ]);
    });

    it('splits unassigned shared spending equally and ignores the joint account', async () => {
      await fabienPays('4000', null, { isShared: true });
      await recordTxn(
        e2e,
        h,
        h.fabien,
        txnBody({ parts: [{ lineId: L.courses, amountMinor: '4230' }] }),
      );
      expect((await tracking()).balances).toEqual([
        { from: h.m, to: h.f, amountMinor: '2000' },
      ]);
    });

    it('allows settling on a closed month', async () => {
      await fabienPays('10447', L.courses);
      await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
        action: 'activate',
      });
      await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
        action: 'close',
      });
      expect((await settle(h.m, h.f, '2612')).status).toBe(201);
    });
  });

  describe('US7 meal vouchers', () => {
    it('never counts voucher income toward the household and shows what is left', async () => {
      const detail = await addIncome(e2e, h, h.maelle, NOV, '16000', {
        label: 'Swile',
        countsTowardHousehold: true,
        isMealVoucher: true,
      });
      expect(
        detail.incomes.find((i: { label: string }) => i.label === 'Swile'),
      ).toMatchObject({ isMealVoucher: true, countsTowardHousehold: false });
      const voucher = (amount: string, lineId: string | null) =>
        recordTxn(
          e2e,
          h,
          h.maelle,
          txnBody({
            amountMinor: amount,
            payer: { kind: 'member', membershipId: h.m },
            paymentMethod: 'meal_voucher',
            parts: lineId ? [{ lineId, amountMinor: amount }] : [],
          }),
        );
      await voucher('1250', null);
      await voucher('4500', L.courses);
      const t = await tracking();
      expect(
        t.vouchers.find(
          (v: { membershipId: string }) => v.membershipId === h.m,
        ),
      ).toEqual({
        membershipId: h.m,
        incomeMinor: '16000',
        spentMinor: '5750',
        remainingMinor: '10250',
      });
      // Clarification Q2: a shared expense paid with vouchers creates a debt like a card.
      expect(t.balances).toEqual([{ from: h.f, to: h.m, amountMinor: '3375' }]);
    });

    it('refuses meal vouchers paid by the joint account', async () => {
      const res = await as(e2e, h.maelle).put(
        txnUrl(h, randomUUID()),
        txnBody({ paymentMethod: 'meal_voucher' }),
      );
      expect(res.status).toBe(400);
    });
  });
});
