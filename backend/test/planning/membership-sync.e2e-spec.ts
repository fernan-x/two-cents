import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addLine,
  createMonth,
  type Household,
  monthUrl,
  seedHousehold,
  shared,
} from '../support/planning';
import { as, signUpUser } from '../support/users';

type Share = { membershipId: string; amountMinor: string };
const sharesOf = (line: { shares: Share[] }) =>
  Object.fromEntries(line.shares.map((s) => [s.membershipId, s.amountMinor]));

/** T115 / research R8: a new member is fitted into open months when they join. */
describe('month membership sync', () => {
  let e2e: E2eApp;
  let h: Household;
  const NOV = '2026-11-01';

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    await createMonth(e2e, h, NOV);
  });

  it('adds a 0 share on custom lines and recomputes equal lines when someone joins', async () => {
    await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'Courses', { [h.m]: '10000', [h.f]: '30000' }),
    );
    await addLine(e2e, h, h.fabien, NOV, {
      group: 'recurring_shared',
      label: 'Électricité',
      split: { mode: 'equal' },
      amount: { entry: 'total', totalMinor: '9000' },
    });
    const before = (await as(e2e, h.fabien).get(monthUrl(h, NOV))).body;

    const invite = await as(e2e, h.fabien).post(
      `/v1/budgets/${h.budgetId}/invitations`,
      { kind: 'code', role: 'member' },
    );
    const charlie = await signUpUser(e2e, { firstName: 'Charlie' });
    const accept = await as(e2e, charlie).post(
      `/v1/invitations/${invite.body.code}/accept`,
    );
    expect(accept.status).toBe(200);

    const after = (await as(e2e, h.fabien).get(monthUrl(h, NOV))).body;
    const c = after.members.find(
      (m: { displayName: string }) => m.displayName === 'Charlie',
    ).membershipId;
    expect(BigInt(after.month.revision)).toBeGreaterThan(
      BigInt(before.month.revision),
    );
    const courses = after.lines.find(
      (l: { label: string }) => l.label === 'Courses',
    );
    expect(sharesOf(courses)).toEqual({
      [h.m]: '10000',
      [h.f]: '30000',
      [c]: '0',
    });
    const elec = after.lines.find(
      (l: { label: string }) => l.label === 'Électricité',
    );
    expect(sharesOf(elec)).toEqual({
      [h.f]: '3000',
      [h.m]: '3000',
      [c]: '3000',
    });

    const history = await as(e2e, h.fabien).get(
      monthUrl(h, NOV, '/history?all=true'),
    );
    const recomputes = history.body.changes.filter(
      (ch: { cause: string }) => ch.cause === 'recompute',
    );
    expect(recomputes.map((ch: { label: string }) => ch.label)).toEqual([
      'Électricité',
    ]);
  });
});
