import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addLine,
  createMonth,
  type Household,
  monthUrl,
  seedHousehold,
  shared,
} from '../support/planning';
import { as } from '../support/users';

type Line = {
  id: string;
  label: string;
  version: number;
  totalMinor: string;
  isException: boolean;
  usualTotalMinor: string | null;
};

/** US6: "from this month on" vs "this month only" (FR-024, FR-025, research R7). */
describe('US6 recurring scopes', () => {
  let e2e: E2eApp;
  let h: Household;
  const NOV = '2026-11-01';
  const DEC = '2026-12-01';

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    await createMonth(e2e, h, NOV);
    await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'Loyer', { [h.m]: '45000', [h.f]: '45000' }),
    );
    await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'Courses', { [h.m]: '10000', [h.f]: '30000' }),
    );
    await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('one_off_shared', 'Ponceuse', { [h.f]: '4000' }),
    );
  });

  const get = async (start: string) =>
    (await as(e2e, h.fabien).get(monthUrl(h, start))).body;
  const find = (detail: { lines: Line[] }, label: string) =>
    detail.lines.find((l) => l.label === label)!;
  const setShares = (
    start: string,
    line: Line,
    m: string,
    f: string,
    scope?: string,
  ) =>
    as(e2e, h.fabien).patch(monthUrl(h, start, `/lines/${line.id}`), {
      expectedVersion: line.version,
      ...(scope ? { scope } : {}),
      amount: {
        entry: 'shares',
        shares: [
          { membershipId: h.m, amountMinor: m },
          { membershipId: h.f, amountMinor: f },
        ],
      },
    });

  it('needs a scope for amount changes on recurring lines only', async () => {
    const nov = await get(NOV);
    const noScope = await setShares(NOV, find(nov, 'Loyer'), '47500', '47500');
    expect(noScope.status).toBe(422);
    expect(noScope.body.error).toBe('SCOPE_REQUIRED');

    const oneOff = find(nov, 'Ponceuse');
    const ok = await as(e2e, h.fabien).patch(
      monthUrl(h, NOV, `/lines/${oneOff.id}`),
      {
        expectedVersion: oneOff.version,
        amount: {
          entry: 'shares',
          shares: [{ membershipId: h.f, amountMinor: '5000' }],
        },
      },
    );
    expect(ok.status).toBe(200);

    const label = await as(e2e, h.fabien).patch(
      monthUrl(h, NOV, `/lines/${find(nov, 'Loyer').id}`),
      {
        expectedVersion: find(nov, 'Loyer').version,
        label: 'Loyer appartement',
      },
    );
    expect(label.status).toBe(200);
  });

  it('"this month only" keeps the usual value for later copies, and clears when set back', async () => {
    const res = await setShares(
      NOV,
      find(await get(NOV), 'Courses'),
      '20000',
      '40000',
      'this_month_only',
    );
    const courses = find(res.body, 'Courses');
    expect(courses).toMatchObject({
      totalMinor: '60000',
      isException: true,
      usualTotalMinor: '40000',
    });

    const dec = await createMonth(e2e, h, DEC, { kind: 'previous' });
    expect(find(dec, 'Courses')).toMatchObject({
      totalMinor: '40000',
      isException: false,
    });

    const back = await setShares(
      NOV,
      courses,
      '10000',
      '30000',
      'this_month_only',
    );
    expect(find(back.body, 'Courses')).toMatchObject({
      isException: false,
      usualTotalMinor: null,
    });
  });

  it('"from this month on" reaches later Draft months not edited by hand', async () => {
    await createMonth(e2e, h, DEC, { kind: 'previous' });
    const decBefore = await get(DEC);
    await setShares(
      NOV,
      find(await get(NOV), 'Loyer'),
      '47500',
      '47500',
      'from_this_month_on',
    );
    const dec = await get(DEC);
    expect(find(dec, 'Loyer').totalMinor).toBe('95000');
    expect(BigInt(dec.month.revision)).toBeGreaterThan(
      BigInt(decBefore.month.revision),
    );
    const history = await as(e2e, h.fabien).get(
      monthUrl(h, DEC, '/history?all=true'),
    );
    expect(history.body.changes[0]).toMatchObject({
      cause: 'propagation',
      label: 'Loyer',
    });
  });

  it('leaves later months alone when edited by hand or not Draft', async () => {
    await createMonth(e2e, h, DEC, { kind: 'previous' });
    // December's Loyer edited by hand.
    await setShares(
      DEC,
      find(await get(DEC), 'Loyer'),
      '46000',
      '46000',
      'this_month_only',
    );
    await setShares(
      NOV,
      find(await get(NOV), 'Loyer'),
      '47500',
      '47500',
      'from_this_month_on',
    );
    expect(find(await get(DEC), 'Loyer').totalMinor).toBe('92000');

    // December active: Courses untouched there.
    await as(e2e, h.fabien).post(monthUrl(h, DEC, '/status'), {
      action: 'activate',
    });
    await setShares(
      NOV,
      find(await get(NOV), 'Courses'),
      '15000',
      '35000',
      'from_this_month_on',
    );
    expect(find(await get(DEC), 'Courses').totalMinor).toBe('40000');
  });
});
