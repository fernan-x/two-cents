import { randomUUID } from 'node:crypto';
import { createBudget, seedMember } from '../support/budgets';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import { fakeProviders } from '../support/fake-providers';
import { as, signUpUser, type TestUser } from '../support/users';
import { BUDGET_ROUTE_CASES, type BudgetRouteCase } from './budget-route-cases';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
afterAll(() => e2e.close());

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

function budgetRoutes(): string[] {
  const router = (
    e2e.app.getHttpAdapter().getInstance() as { router: { stack: Layer[] } }
  ).router;
  return router.stack
    .filter((l) => l.route?.path.includes(':budgetId'))
    .flatMap((l) =>
      Object.keys(l.route!.methods).map(
        (m) => `${m.toUpperCase()} ${l.route!.path}`,
      ),
    );
}

function call(
  user: TestUser,
  route: string,
  budgetId: string,
  c: BudgetRouteCase,
) {
  const [method, path] = route.split(' ');
  let url = path.replace(':budgetId', budgetId);
  for (const [k, v] of Object.entries(c.params ?? {}))
    url = url.replace(`:${k}`, v);
  const client = as(e2e, user);
  const verb = method.toLowerCase() as
    'get' | 'post' | 'put' | 'patch' | 'delete';
  return client[verb](url, c.body);
}

describe('Budget authorization coverage (SC-002, FR-039 to FR-041)', () => {
  let owner: TestUser;
  let viewer: TestUser;
  let stranger: TestUser;
  let budgetId: string;

  beforeAll(async () => {
    await e2e.reset();
    owner = await signUpUser(e2e, { firstName: 'Fabien' });
    viewer = await signUpUser(e2e, { firstName: 'Comptable' });
    stranger = await signUpUser(e2e, { firstName: 'Inconnu' });
    budgetId = (await createBudget(e2e, owner)).id;
    await seedMember(e2e, budgetId, viewer, 'viewer');
  });

  it('every budget route has a case, and every case a route', () => {
    const routes = budgetRoutes();
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.filter((r) => !BUDGET_ROUTE_CASES[r])).toEqual([]);
    expect(
      Object.keys(BUDGET_ROUTE_CASES).filter((r) => !routes.includes(r)),
    ).toEqual([]);
  });

  for (const [route, c] of Object.entries(BUDGET_ROUTE_CASES)) {
    it(`${route}: a non-member gets the same 404 as for an unknown budget`, async () => {
      const real = await call(stranger, route, budgetId, c);
      const unknown = await call(stranger, route, randomUUID(), c);
      expect({ route, status: real.status, body: real.body }).toEqual({
        route,
        status: 404,
        body: unknown.body,
      });
      expect(real.body.error).toBe('BUDGET_NOT_FOUND');
    });

    if (c.viewer === 'forbidden' && !c.special)
      it(`${route}: a viewer gets 403`, async () => {
        const res = await call(viewer, route, budgetId, c);
        expect({ route, status: res.status, error: res.body.error }).toEqual({
          route,
          status: 403,
          error: 'FORBIDDEN',
        });
      });
  }

  it('a deleted budget answers 404 to its own members on every route but restore', async () => {
    const other = await createBudget(e2e, owner, { name: 'À supprimer' });
    await seedMember(e2e, other.id, viewer, 'viewer');
    const del = await as(e2e, owner).delete(`/v1/budgets/${other.id}`, {
      confirmName: 'À supprimer',
    });
    expect(del.status).toBe(204);
    for (const [route, c] of Object.entries(BUDGET_ROUTE_CASES)) {
      if (c.special === 'restore') continue;
      for (const user of [owner, viewer]) {
        const res = await call(user, route, other.id, c);
        expect({ route, status: res.status }).toEqual({ route, status: 404 });
      }
    }
    // Restore: only the owner who deleted it.
    const byViewer = await as(e2e, viewer).post(
      `/v1/budgets/${other.id}/restore`,
    );
    expect(byViewer.status).toBe(404);
    const live = await as(e2e, owner).post(`/v1/budgets/${budgetId}/restore`);
    expect(live.status).toBe(404);
  });
});
