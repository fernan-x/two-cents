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

/** US1: seeing the partner's edits (R4, SC-004) and concurrent edits (R5, FR-034). */
describe('US1 sync and conflicts', () => {
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

  it('answers 304 while the revision is unchanged, 200 after a write', async () => {
    const first = await as(e2e, h.fabien).get(monthUrl(h, NOV));
    const etag = first.headers.etag;
    expect(etag).toBe(`"${first.body.month.revision}"`);
    const same = await as(e2e, h.fabien)
      .get(monthUrl(h, NOV))
      .set('If-None-Match', etag);
    expect(same.status).toBe(304);
    expect(same.text).toBeFalsy();

    await addLine(
      e2e,
      h,
      h.maelle,
      NOV,
      shared('recurring_shared', 'Courses', { [h.m]: '100' }),
    );
    const changed = await as(e2e, h.fabien)
      .get(monthUrl(h, NOV))
      .set('If-None-Match', etag);
    expect(changed.status).toBe(200);
    expect(changed.headers.etag).not.toBe(etag);
    expect(changed.body.lines).toHaveLength(1);
  });

  it('refuses a stale version with the current line (FR-034)', async () => {
    const detail = await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('one_off_shared', 'Ponceuse', { [h.f]: '4000' }),
    );
    const line = detail.lines[0];
    const first = await as(e2e, h.maelle).patch(
      monthUrl(h, NOV, `/lines/${line.id}`),
      {
        expectedVersion: line.version,
        label: 'Ponceuse (location)',
      },
    );
    expect(first.status).toBe(200);
    const second = await as(e2e, h.fabien).patch(
      monthUrl(h, NOV, `/lines/${line.id}`),
      {
        expectedVersion: line.version,
        label: 'Ponceuse orbitale',
      },
    );
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('STALE_STATE');
    expect(second.body.current).toMatchObject({
      id: line.id,
      label: 'Ponceuse (location)',
      version: line.version + 1,
    });

    const staleDelete = await as(e2e, h.fabien).delete(
      monthUrl(h, NOV, `/lines/${line.id}?expectedVersion=${line.version}`),
    );
    expect(staleDelete.status).toBe(409);
  });

  it('refuses a reorder whose id set does not match the section', async () => {
    const detail = await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'A', { [h.f]: '1' }),
    );
    const res = await as(e2e, h.fabien).put(monthUrl(h, NOV, '/lines/order'), {
      group: 'recurring_shared',
      lineIds: [detail.lines[0].id, '00000000-0000-7000-8000-000000000009'],
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('STALE_STATE');
  });
});
