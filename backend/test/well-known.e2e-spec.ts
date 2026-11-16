import { createE2eApp, type E2eApp } from './support/e2e-app';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp();
});
afterAll(() => e2e.close());

describe('universal links', () => {
  it('serves the Apple association file outside /v1', async () => {
    const res = await e2e
      .client()
      .get('/.well-known/apple-app-site-association');
    expect(res.status).toBe(200);
    expect(res.body.applinks.details[0].appIDs).toEqual([
      'TEAMID.app.twocents.test',
    ]);
  });

  it('serves an "open the app" page for email links without echoing the token', async () => {
    const res = await e2e
      .client()
      .get('/l/reset?t=secret-token-value')
      .set('Accept-Language', 'fr-FR');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ouvrez Two Cents');
    expect(res.text).not.toContain('secret-token-value');
  });
});
