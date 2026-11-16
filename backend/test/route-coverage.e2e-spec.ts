import { createE2eApp, type E2eApp } from './support/e2e-app';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp();
});
afterAll(() => e2e.close());

/** Routes that are meant to work without a session (contracts/api.md). Everything else must answer 401. */
const PUBLIC = new Set([
  'POST /v1/auth/signup',
  'POST /v1/auth/login',
  'POST /v1/auth/apple',
  'POST /v1/auth/google',
  'POST /v1/auth/link/password',
  'POST /v1/auth/link/email',
  'POST /v1/auth/link/confirm',
  'POST /v1/auth/refresh',
  'POST /v1/auth/email/confirm',
  'POST /v1/auth/password/forgot',
  'POST /v1/auth/password/reset',
  'POST /v1/auth/apple/notifications',
  'POST /v1/me/deletion/cancel-by-link',
]);

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe('route coverage', () => {
  it('refuses every non-public /v1 route without a token', async () => {
    const router = (
      e2e.app.getHttpAdapter().getInstance() as { router: { stack: Layer[] } }
    ).router;
    const routes = router.stack
      .filter((l) => l.route && l.route.path.startsWith('/v1/'))
      .flatMap((l) =>
        Object.keys(l.route!.methods).map((m) => ({
          method: m.toUpperCase(),
          path: l.route!.path,
        })),
      );
    expect(routes.length).toBeGreaterThan(20);
    for (const { method, path } of routes) {
      if (PUBLIC.has(`${method} ${path}`)) continue;
      const url = path.replace(
        /:[a-zA-Z]+/g,
        '00000000-0000-7000-8000-000000000000',
      );
      const res = await e2e.client()[method.toLowerCase() as 'get'](url);
      expect({ route: `${method} ${path}`, status: res.status }).toEqual({
        route: `${method} ${path}`,
        status: 401,
      });
    }
  });
});
