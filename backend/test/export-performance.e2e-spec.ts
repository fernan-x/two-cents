import { strFromU8, unzipSync } from 'fflate';
import {
  BUDGET_EXPORT_PORT,
  type BudgetExportPort,
} from '../src/identity/application/ports/budgets';
import { createE2eApp, device, type E2eApp } from './support/e2e-app';
import { fakeProviders } from './support/fake-providers';

/** Two years of a household's entries: ~10 per day. */
const twoYears: BudgetExportPort = {
  exportForUser: () =>
    Promise.resolve({
      budgets: [{ id: 'b1', name: 'Maison Maëlle & Fabien', currency: 'EUR' }],
      entries: Array.from({ length: 7300 }, (_, i) => ({
        budgetId: 'b1',
        date: new Date(Date.UTC(2024, 10, 16) + Math.floor(i / 10) * 86_400_000)
          .toISOString()
          .slice(0, 10),
        label: `Courses ${i}`,
        amountMinor: 1250 + i,
        currency: 'EUR',
        amount: `${((1250 + i) / 100).toFixed(2).replace('.', ',')} €`,
        author: i % 2 ? 'Maëlle' : 'ancien membre',
      })),
    }),
};

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp([
    ...fakeProviders().overrides,
    { provide: BUDGET_EXPORT_PORT, useValue: twoYears },
  ]);
});
afterAll(() => e2e.close());

it('exports two years of entries in under 30 seconds (SC-008)', async () => {
  await e2e.reset();
  const { body } = await e2e.client().post('/v1/auth/signup').send({
    email: 'u@example.com',
    password: 'un mot de passe solide',
    firstName: 'U',
    locale: 'fr',
    device,
  });
  const started = Date.now();
  const res = await e2e
    .client()
    .get('/v1/me/export')
    .set('Authorization', `Bearer ${body.tokens.accessToken}`)
    .buffer(true)
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  expect(Date.now() - started).toBeLessThan(30_000);
  const entries = strFromU8(
    unzipSync(new Uint8Array(res.body as Buffer))['entries.csv'],
  );
  expect(entries.split('\r\n').length).toBe(7300 + 2);
});
