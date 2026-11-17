import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addIncome,
  addLine,
  createMonth,
  type Household,
  monthUrl,
  seedHousehold,
  shared,
} from '../support/planning';
import { as } from '../support/users';

/** US7: browse past months (FR-008). */
describe('US7 browse months', () => {
  let e2e: E2eApp;
  let h: Household;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
  });

  it("lists months newest first, 12 per page, with each member's what's left", async () => {
    const starts: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.UTC(2025, 9 + i, 1)); // Oct 2025 → Nov 2026
      starts.push(d.toISOString().slice(0, 10));
    }
    for (const s of starts) await createMonth(e2e, h, s);
    await addIncome(e2e, h, h.maelle, '2026-11-01', '1000');
    await addLine(
      e2e,
      h,
      h.fabien,
      '2026-11-01',
      shared('recurring_shared', 'Loyer', { [h.m]: '2000', [h.f]: '0' }),
    );
    await as(e2e, h.fabien).post(monthUrl(h, '2026-11-01', '/status'), {
      action: 'activate',
    });
    await as(e2e, h.fabien).post(monthUrl(h, '2026-11-01', '/status'), {
      action: 'close',
    });

    const url = `/v1/budgets/${h.budgetId}/months`;
    const first = await as(e2e, h.victor).get(url);
    expect(first.status).toBe(200);
    expect(first.body.months.map((m: { start: string }) => m.start)).toEqual(
      [...starts].reverse().slice(0, 12),
    );
    expect(first.body.months[0]).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
      status: 'closed',
      members: [
        { membershipId: h.f, whatsLeftMinor: '0', overrun: false },
        { membershipId: h.m, whatsLeftMinor: '-1000', overrun: true },
      ],
    });
    expect(first.body.nextCursor).toBe('2025-12-01');
    const second = await as(e2e, h.victor).get(
      `${url}?cursor=${first.body.nextCursor}`,
    );
    expect(second.body.months.map((m: { start: string }) => m.start)).toEqual([
      '2025-11-01',
      '2025-10-01',
    ]);
    expect(second.body.nextCursor).toBeNull();
  });
});
