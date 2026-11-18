import { randomUUID } from 'node:crypto';
import type { Response } from 'supertest';
import type { E2eApp } from './e2e-app';
import {
  addLine,
  createMonth,
  personal,
  shared,
  type Household,
} from './planning';
import { as, type TestUser } from './users';

export const NOV = '2026-11-01';

export const txnUrl = (h: Household, id: string) =>
  `/v1/budgets/${h.budgetId}/transactions/${id}`;

/** A quick-add body; joint account by default. */
export const txnBody = (over: object = {}) => ({
  date: '2026-11-10',
  amountMinor: '4230',
  label: 'Leclerc',
  payer: { kind: 'joint' },
  parts: [],
  origin: 'quick_add',
  ...over,
});

export async function putTxn(
  e2e: E2eApp,
  h: Household,
  user: TestUser,
  body: object,
  id: string = randomUUID(),
): Promise<{ id: string; res: Response }> {
  const res = await as(e2e, user).put(txnUrl(h, id), body);
  return { id, res };
}

export async function recordTxn(
  e2e: E2eApp,
  h: Household,
  user: TestUser,
  body: object,
): Promise<{ id: string; version: number }> {
  const { id, res } = await putTxn(e2e, h, user, body);
  if (res.status !== 201)
    throw new Error(`record failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id, version: res.body.version };
}

export interface NovemberLines {
  courses: string;
  loyer: string;
  maison: string;
  animalerie: string;
  croquettes: string;
  psy: string;
  phoneF: string;
}

/**
 * Novembre 2026 with the lines the spec 004 quickstart uses: Courses (envelope, Maëlle 100 € /
 * Fabien 300 €), Loyer 950 €, Maison (one-off 50/50), Animalerie (envelope with sub-items),
 * Maëlle's private "Psy" and Fabien's phone plan.
 */
export async function seedNovemberLines(
  e2e: E2eApp,
  h: Household,
): Promise<NovemberLines> {
  await createMonth(e2e, h, NOV);
  const both = (m: string, f: string) => ({ [h.m]: m, [h.f]: f });
  await addLine(e2e, h, h.fabien, NOV, {
    ...shared('recurring_shared', 'Courses', both('10000', '30000')),
    isEnvelope: true,
  });
  await addLine(
    e2e,
    h,
    h.fabien,
    NOV,
    shared('recurring_shared', 'Loyer', both('47500', '47500')),
  );
  await addLine(
    e2e,
    h,
    h.fabien,
    NOV,
    shared('one_off_shared', 'Maison', both('5000', '5000')),
  );
  await addLine(e2e, h, h.fabien, NOV, {
    ...shared('recurring_shared', 'Animalerie', both('6000', '6000')),
    isEnvelope: true,
    subItems: [
      { label: 'Croquettes', amountMinor: '8000' },
      { label: 'Litière', amountMinor: null },
    ],
  });
  await addLine(e2e, h, h.maelle, NOV, {
    ...personal(h.m, 'Psy', '6000'),
    isPrivate: true,
  });
  const detail = await addLine(
    e2e,
    h,
    h.fabien,
    NOV,
    personal(h.f, 'Forfait mobile', '1999'),
  );
  const find = (label: string) =>
    detail.lines.find((l: { label: string }) => l.label === label);
  const all = (
    await as(e2e, h.maelle).get(`/v1/budgets/${h.budgetId}/months/${NOV}`)
  ).body;
  return {
    courses: find('Courses').id,
    loyer: find('Loyer').id,
    maison: find('Maison').id,
    animalerie: find('Animalerie').id,
    croquettes: find('Animalerie').subItems[0].id,
    psy: all.lines.find((l: { label: string }) => l.label === 'Psy').id,
    phoneF: find('Forfait mobile').id,
  };
}
