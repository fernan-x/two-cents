import type { Group } from '../planning/types';
import { normalize } from './text';
import type { CategoryKey } from './types';

/** Section header → group, or the income section. */
export function sectionOf(label: string): Group | 'income' | null {
  const n = normalize(label);
  if (/^(revenus?|salaires?|incomes?)$/.test(n)) return 'income';
  if (/^(di|depenses individuelles|depenses perso(nnelles)?|perso(nnel)?)$/.test(n)) return 'personal';
  if (/^(dcr|depenses communes recurrentes|communes recurrentes|recurrentes?)$/.test(n)) return 'recurring_shared';
  if (/^(dce|depenses communes exceptionnelles|communes exceptionnelles|exceptionnelles?)$/.test(n))
    return 'one_off_shared';
  return null;
}

export function isTotalRow(label: string): 'total' | 'whatsLeft' | null {
  const n = normalize(label);
  if (/^(reste|reste a vivre|what'?s left|solde)\b/.test(n)) return 'whatsLeft';
  if (/^(total|sous-total|virement)\b/.test(n)) return 'total';
  return null;
}

const SAVINGS = /\b(pea|pel|cel|per|livret|epargne|assurance vie|assurance-vie|placement|savings)\b/;

export function isSavings(label: string): boolean {
  return SAVINGS.test(normalize(label));
}

/** Income lines that usually don't count toward the household budget (meal vouchers, FR-009). */
export function isMealVoucher(label: string): boolean {
  return /\b(swile|ticket|tickets|titre restaurant|titres restaurant|tr|edenred|sodexo|lunchr|apetiz)\b/.test(
    normalize(label),
  );
}

const CATEGORIES: Array<[CategoryKey, RegExp]> = [
  ['savings', SAVINGS],
  ['housing', /\b(loyer|credit|pret|immobilier|charges|electricite|edf|gaz|eau|internet|box|habitation|taxe fonciere)\b/],
  ['food', /\b(courses|alimentation|supermarche|marche|boulangerie)\b/],
  ['transport', /\b(carburant|essence|gasoil|voiture|auto|train|navigo|transport|parking|peage)\b/],
  ['pets', /\b(chats?|chiens?|animaux|veterinaire|veto|croquettes|litiere)\b/],
  ['leisure', /\b(restaurants?|sorties?|loisirs?|vacances|escalade|sport|cinema|concert|salle de sport)\b/],
  ['health', /\b(sante|psy|medecin|pharmacie|mutuelle|dentiste|kine)\b/],
  ['subscriptions', /\b(abonnements?|spotify|netflix|deezer|streaming|forfait|mobile|telephone|disney|prime)\b/],
  ['gifts', /\b(cadeaux?|noel|anniversaire)\b/],
];

export function categoryOf(label: string): CategoryKey | null {
  const n = normalize(label);
  for (const [key, re] of CATEGORIES) if (re.test(n)) return key;
  return null;
}
