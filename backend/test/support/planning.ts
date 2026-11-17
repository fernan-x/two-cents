import { sql } from 'drizzle-orm';
import { createBudget, seedMember } from './budgets';
import type { E2eApp } from './e2e-app';
import { as, signUpUser, type TestUser } from './users';

/** "Today" for planning e2e tests: Novembre 2026 is the current month. */
export const TODAY = '2026-11-16T10:00:00Z';

export interface Household {
  budgetId: string;
  fabien: TestUser;
  maelle: TestUser;
  victor: TestUser;
  olivia: TestUser;
  /** Membership ids. */
  f: string;
  m: string;
  v: string;
}

/**
 * Fabien (owner) and Maëlle (member) contribute; Victor is a viewer; Olivia is an outsider. The
 * clock is set to {@link TODAY}; memberships are backdated to January 2025 so past months include them.
 */
export async function seedHousehold(e2e: E2eApp): Promise<Household> {
  e2e.clock.set(TODAY);
  const fabien = await signUpUser(e2e, { firstName: 'Fabien' });
  const maelle = await signUpUser(e2e, { firstName: 'Maëlle' });
  const victor = await signUpUser(e2e, { firstName: 'Victor' });
  const olivia = await signUpUser(e2e, { firstName: 'Olivia' });
  const budget = await createBudget(e2e, fabien);
  const joined = new Date('2025-01-10T11:00:00Z');
  const m = await seedMember(e2e, budget.id, maelle, 'member', joined);
  const v = await seedMember(e2e, budget.id, victor, 'viewer', joined);
  // Backdate the owner too, so past months include everyone (tokens stay valid: signed up "today").
  await e2e.db.execute(
    sql`UPDATE membership SET joined_at = ${joined} WHERE budget_id = ${budget.id}`,
  );
  return {
    budgetId: budget.id,
    fabien,
    maelle,
    victor,
    olivia,
    f: budget.members[0].membershipId,
    m,
    v,
  };
}

export const monthUrl = (h: Household, start: string, rest = '') =>
  `/v1/budgets/${h.budgetId}/months/${start}${rest}`;

export async function createMonth(
  e2e: E2eApp,
  h: Household,
  periodStart: string,
  source: object = { kind: 'scratch' },
  user: TestUser = h.fabien,
) {
  const res = await as(e2e, user).post(`/v1/budgets/${h.budgetId}/months`, {
    periodStart,
    source,
  });
  if (res.status !== 201)
    throw new Error(
      `create month failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  return res.body;
}

export async function addIncome(
  e2e: E2eApp,
  h: Household,
  user: TestUser,
  start: string,
  amountMinor: string,
  extra: object = {},
) {
  const res = await as(e2e, user).post(monthUrl(h, start, '/incomes'), {
    amountMinor,
    ...extra,
  });
  if (res.status !== 201)
    throw new Error(
      `add income failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  return res.body;
}

export async function addLine(
  e2e: E2eApp,
  h: Household,
  user: TestUser,
  start: string,
  body: object,
) {
  const res = await as(e2e, user).post(monthUrl(h, start, '/lines'), body);
  if (res.status !== 201)
    throw new Error(
      `add line failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  return res.body;
}

export const personal = (
  owner: string,
  label: string,
  totalMinor: string,
  kind = 'expense',
) => ({
  group: 'personal',
  kind,
  label,
  ownerMembershipId: owner,
  amount: { entry: 'total', totalMinor },
});

export const shared = (
  group: 'recurring_shared' | 'one_off_shared',
  label: string,
  shares: Record<string, string>,
  kind = 'expense',
) => ({
  group,
  kind,
  label,
  split: { mode: 'custom' },
  amount: {
    entry: 'shares',
    shares: Object.entries(shares).map(([membershipId, amountMinor]) => ({
      membershipId,
      amountMinor,
    })),
  },
});

/** The spec's Novembre 2026 example (same lines as packages/shared/test/fixtures/novembre-2026.ts). */
export async function seedNovembre2026(
  e2e: E2eApp,
  h: Household,
): Promise<void> {
  const start = '2026-11-01';
  await createMonth(e2e, h, start);
  await addIncome(e2e, h, h.maelle, start, '200000', { label: 'Salaire' });
  await addIncome(e2e, h, h.fabien, start, '299000', { label: 'Salaire' });
  await addIncome(e2e, h, h.fabien, start, '16000', {
    label: 'Swile',
    countsTowardHousehold: false,
  });
  const mine = [
    personal(h.m, 'Forfait mobile', '1500'),
    personal(h.m, 'Spotify', '1250'),
    personal(h.m, 'Psy', '6000'),
    personal(h.m, 'Salle de sport', '2990'),
    personal(h.m, 'Livret A', '2692', 'savings'),
  ];
  for (const l of mine) await addLine(e2e, h, h.maelle, start, l);
  const his = [
    personal(h.f, 'Forfait mobile', '1999'),
    personal(h.f, 'Assurance vie', '30000', 'savings'),
    personal(h.f, 'Escalade', '5500'),
    personal(h.f, 'Abonnements', '1433'),
    personal(h.f, 'PEA', '20000', 'savings'),
  ];
  for (const l of his) await addLine(e2e, h, h.fabien, start, l);
  const both = (m: string, f: string) => ({ [h.m]: m, [h.f]: f });
  const sharedLines = [
    shared('recurring_shared', 'Loyer', both('95000', '95000')),
    shared('recurring_shared', 'Courses', both('10000', '30000')),
    shared('recurring_shared', 'Électricité', both('6000', '6000')),
    shared('recurring_shared', 'Carburant', both('5000', '23000')),
    shared('recurring_shared', 'Assurance habitation', both('1252', '1252')),
    shared('recurring_shared', 'Chats', both('4500', '4500')),
    shared('recurring_shared', 'Streaming', both('1500', '1500')),
    shared('recurring_shared', 'Restaurants', both('10000', '10000')),
    shared(
      'recurring_shared',
      'Épargne commune',
      both('25500', '25500'),
      'savings',
    ),
    shared('one_off_shared', 'Cadeaux de Noël', both('27500', '27500')),
  ];
  for (const l of sharedLines) await addLine(e2e, h, h.fabien, start, l);
}
