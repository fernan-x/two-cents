import { createE2eApp, type E2eApp } from './support/e2e-app';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp();
});
afterAll(() => e2e.close());

describe('app shell', () => {
  it('returns the contract error body for unknown routes', async () => {
    const res = await e2e.client().get('/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
  });
});
