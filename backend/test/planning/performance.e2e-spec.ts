import { seedMember } from '../support/budgets';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addLine,
  createMonth,
  type Household,
  monthUrl,
  seedHousehold,
} from '../support/planning';
import { as, signUpUser } from '../support/users';

/** T117 / research R19: a full month stays fast to read, and polling (304) is cheaper still. */
describe('planning performance', () => {
  let e2e: E2eApp;
  let h: Household;
  const NOV = '2026-11-01';

  beforeAll(async () => {
    e2e = await createE2eApp();
    await e2e.reset();
    h = await seedHousehold(e2e);
    const joined = new Date('2025-01-10T12:00:00Z');
    for (const name of ['Alex', 'Sam', 'Lou', 'Noa'])
      await seedMember(
        e2e,
        h.budgetId,
        await signUpUser(e2e, { firstName: name }),
        'member',
        joined,
      );
    const month = await createMonth(e2e, h, NOV);
    expect(month.members).toHaveLength(6);
    for (let i = 0; i < 80; i++)
      await addLine(e2e, h, h.fabien, NOV, {
        group: i % 3 === 0 ? 'one_off_shared' : 'recurring_shared',
        label: `Ligne ${i}`,
        split: { mode: 'equal' },
        amount: { entry: 'total', totalMinor: String(1000 + i * 37) },
      });
  }, 120_000);
  afterAll(() => e2e.close());

  const p95 = (samples: number[]) =>
    [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];

  async function time(
    run: () => Promise<{ status: number }>,
    expected: number,
  ) {
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      const res = await run();
      samples.push(performance.now() - start);
      expect(res.status).toBe(expected);
    }
    return p95(samples);
  }

  it('GET month with 80 lines × 6 members: p95 under 300 ms; 304 under 50 ms', async () => {
    const full = await time(() => as(e2e, h.maelle).get(monthUrl(h, NOV)), 200);
    const etag = (await as(e2e, h.maelle).get(monthUrl(h, NOV))).headers.etag;
    const notModified = await time(
      () => as(e2e, h.maelle).get(monthUrl(h, NOV)).set('If-None-Match', etag),
      304,
    );
    expect(full).toBeLessThan(300);
    expect(notModified).toBeLessThan(50);
  }, 60_000);
});
