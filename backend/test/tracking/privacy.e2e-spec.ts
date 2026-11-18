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

/** T046: a private-line transaction never reaches another member (FR-048, Principle III). */
describe('tracking privacy', () => {
  let e2e: E2eApp;
  let h: Household;
  let L: NovemberLines;
  const SECRET_LABEL = 'Séance confidentielle';
  const SECRET_AMOUNT = '7317';
  const SECRET_NOTE = 'note très privée';

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    L = await seedNovemberLines(e2e, h);
    await recordTxn(
      e2e,
      h,
      h.maelle,
      txnBody({
        label: SECRET_LABEL,
        amountMinor: SECRET_AMOUNT,
        note: SECRET_NOTE,
        payer: { kind: 'member', membershipId: h.m },
        parts: [{ lineId: L.psy, amountMinor: SECRET_AMOUNT }],
      }),
    );
  });

  const leaks = (body: unknown) => {
    const json = JSON.stringify(body);
    return [SECRET_LABEL, SECRET_AMOUNT, SECRET_NOTE].filter((s) =>
      json.includes(s),
    );
  };

  it('shows Fabien a private stub in the list and nothing in tracking, hints or history', async () => {
    const list = await as(e2e, h.fabien).get(monthUrl(h, NOV, '/transactions'));
    expect(list.body.transactions).toEqual([
      expect.objectContaining({ private: true, ownerMembershipId: h.m }),
    ]);
    expect(leaks(list.body)).toEqual([]);

    const tracking = await as(e2e, h.fabien).get(monthUrl(h, NOV, '/tracking'));
    expect(
      tracking.body.lines.map((l: { lineId: string }) => l.lineId),
    ).not.toContain(L.psy);
    expect(tracking.body.privateAggregates).toEqual([
      { membershipId: h.m, plannedMinor: '6000', actualMinor: SECRET_AMOUNT },
    ]);
    // The aggregate is the only place the amount appears, by design (one "Privé" row).
    const withoutAggregate = { ...tracking.body, privateAggregates: [] };
    expect(leaks(withoutAggregate).filter((s) => s !== SECRET_AMOUNT)).toEqual(
      [],
    );

    const history = await as(e2e, h.fabien).get(
      monthUrl(h, NOV, '/history?all=true'),
    );
    expect(leaks(history.body)).toEqual([]);
  });

  it('shows Maëlle her own transaction in full', async () => {
    const list = await as(e2e, h.maelle).get(monthUrl(h, NOV, '/transactions'));
    expect(list.body.transactions[0]).toMatchObject({
      private: false,
      label: SECRET_LABEL,
      note: SECRET_NOTE,
    });
  });
});
