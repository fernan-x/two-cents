import { randomUUID } from 'node:crypto';
import { budgetMonthFor, localDateIn } from '@two-cents/shared/domain';
import { sql } from 'drizzle-orm';
import type { E2eApp } from './e2e-app';
import { as, type TestUser } from './users';

/** Creates a budget through the API and returns its detail. */
export async function createBudget(
  e2e: E2eApp,
  owner: TestUser,
  body: Record<string, unknown> = {},
) {
  const res = await as(e2e, owner).post('/v1/budgets', {
    name: 'Maison Maëlle & Fabien',
    timeZone: 'Europe/Paris',
    ...body,
  });
  if (res.status !== 201)
    throw new Error(
      `create budget failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  return res.body as {
    id: string;
    name: string;
    currentMonth: { start: string; end: string };
    members: Array<{ membershipId: string; isMe: boolean }>;
  };
}

/** Adds `user` to the budget directly, without the invitation flow. Returns the membership id. */
export async function seedMember(
  e2e: E2eApp,
  budgetId: string,
  user: TestUser,
  role: 'admin' | 'member' | 'viewer',
  joinedAt = new Date(),
): Promise<string> {
  const id = randomUUID();
  await e2e.db.execute(sql`
    INSERT INTO membership (id, budget_id, user_id, role, joined_at)
    VALUES (${id}, ${budgetId}, ${user.userId}, ${role}, ${joinedAt})`);
  return id;
}

/** The current budget month start for a Europe/Paris budget with start day 1. */
export function currentMonthStart(now = new Date()): string {
  return budgetMonthFor(localDateIn(now, 'Europe/Paris'), [
    { effectiveFrom: '2000-01-01', startDay: 1 },
  ]).start;
}
