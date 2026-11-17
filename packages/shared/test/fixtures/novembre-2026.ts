import { parseAmount } from '../../src/domain/money';
import type { Group, Kind, PlanIncome, PlanLine, PlanMember } from '../../src/domain/planning/types';

/**
 * The household's Novembre 2026 (spec example, SC-003), amounts written the way a person types
 * them. Spotify is typed `12,5`: the text value the spreadsheet silently left out of its totals.
 */
export const MAELLE = 'maelle';
export const FABIEN = 'fabien';

const eur = (typed: string): bigint => {
  const minor = parseAmount(typed, 'EUR');
  if (minor === null) throw new Error(`fixture amount not parseable: ${typed}`);
  return minor;
};

export const members: PlanMember[] = [
  { membershipId: MAELLE, order: 0 },
  { membershipId: FABIEN, order: 1 },
];

export const incomes: PlanIncome[] = [
  { membershipId: MAELLE, amount: eur('2 000,00'), counts: true },
  { membershipId: FABIEN, amount: eur('2 990,00'), counts: true },
  { membershipId: FABIEN, amount: eur('160,00'), counts: false }, // Swile
];

export interface FixtureLine extends PlanLine {
  label: string;
}

const personal = (owner: string, label: string, typed: string, kind: Kind = 'expense'): FixtureLine => {
  const amount = eur(typed);
  return { label, group: 'personal', kind, total: amount, shares: { [owner]: amount } };
};

const shared = (
  group: Exclude<Group, 'personal'>,
  label: string,
  maelle: string,
  fabien: string,
  kind: Kind = 'expense',
): FixtureLine => {
  const m = eur(maelle);
  const f = eur(fabien);
  return { label, group, kind, total: m + f, shares: { [MAELLE]: m, [FABIEN]: f } };
};

export const lines: FixtureLine[] = [
  personal(MAELLE, 'Forfait mobile', '15,00'),
  personal(MAELLE, 'Spotify', '12,5'),
  personal(MAELLE, 'Psy', '60,00'),
  personal(MAELLE, 'Salle de sport', '29,90'),
  personal(MAELLE, 'Livret A', '26,92', 'savings'),
  personal(FABIEN, 'Forfait mobile', '19,99'),
  personal(FABIEN, 'Assurance vie', '300,00', 'savings'),
  personal(FABIEN, 'Escalade', '55,00'),
  personal(FABIEN, 'Abonnements', '14,33'),
  personal(FABIEN, 'PEA', '200,00', 'savings'),
  shared('recurring_shared', 'Loyer', '950,00', '950,00'),
  shared('recurring_shared', 'Courses', '100,00', '300,00'),
  shared('recurring_shared', 'Électricité', '60,00', '60,00'),
  shared('recurring_shared', 'Carburant', '50,00', '230,00'),
  shared('recurring_shared', 'Assurance habitation', '12,52', '12,52'),
  shared('recurring_shared', 'Chats', '45,00', '45,00'),
  shared('recurring_shared', 'Streaming', '15,00', '15,00'),
  shared('recurring_shared', 'Restaurants', '100,00', '100,00'),
  shared('recurring_shared', 'Épargne commune', '255,00', '255,00', 'savings'),
  shared('one_off_shared', 'Cadeaux de Noël', '275,00', '275,00'),
];

/** Every figure the summary must show, in cents (spec example, corrected figures). */
export const expected = {
  [MAELLE]: {
    countedIncome: 200000n,
    otherIncome: 0n,
    di: 14432n,
    dcr: 158752n,
    dce: 27500n,
    whatsLeft: -684n,
    transfer: 186252n,
    savings: 28192n,
    savingsRatePermille: 141,
    overrun: true,
  },
  [FABIEN]: {
    countedIncome: 299000n,
    otherIncome: 16000n,
    di: 58932n,
    dcr: 196752n,
    dce: 27500n,
    whatsLeft: 15816n,
    transfer: 224252n,
    savings: 75500n,
    savingsRatePermille: 253,
    overrun: false,
  },
  household: {
    countedIncome: 499000n,
    otherIncome: 16000n,
    planned: 483868n,
    whatsLeft: 15132n,
    transfer: 410504n,
    savings: 103692n,
  },
};
