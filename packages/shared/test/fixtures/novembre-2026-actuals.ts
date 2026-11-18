import { parseAmount } from '../../src/domain/money';
import type { BalanceLine } from '../../src/domain/tracking/balances';
import type { TrackLine, Tx } from '../../src/domain/tracking/types';
import { FABIEN, MAELLE, lines as planLines, members } from './novembre-2026';

/**
 * Novembre 2026 with the quickstart transactions (spec 004): Courses 250 / 80 / 90 €, Fabien pays
 * 104,47 € of Courses with his card, Maëlle pays 12,50 € + 45,00 € with meal vouchers.
 */
export { FABIEN, MAELLE, members };

const eur = (typed: string): bigint => {
  const minor = parseAmount(typed, 'EUR');
  if (minor === null) throw new Error(`fixture amount not parseable: ${typed}`);
  return minor;
};

const idOf = (label: string, owner?: string) => (owner ? `${label}:${owner}` : label);

export const trackLines: TrackLine[] = planLines.map((l) => {
  const owner = l.group === 'personal' ? Object.keys(l.shares)[0] : null;
  return {
    id: idOf(l.label, owner ?? undefined),
    group: l.group,
    planned: l.total,
    isEnvelope: ['Courses', 'Carburant', 'Chats'].includes(l.label),
    ownerMembershipId: owner,
    isPrivate: l.label === 'Psy',
    subItems: [],
    shares: l.shares,
  };
});

export const balanceLines: Record<string, BalanceLine> = Object.fromEntries(
  trackLines.map((l) => [l.id, { group: l.group, shares: l.shares }]),
);

let n = 0;
const tx = (amount: string, lineId: string | null, payer: string | null, method: Tx['method']): Tx => {
  const value = eur(amount);
  return {
    id: `t${n++}`,
    date: '2026-11-15',
    amount: value,
    payer: payer ? { kind: 'member', membershipId: payer } : { kind: 'joint' },
    method,
    isPlanned: lineId !== null,
    isShared: false,
    parts: lineId ? [{ lineId, subItemId: null, amount: value }] : [],
  };
};

export const txnsUpTo82 = [tx('250,00', 'Courses', null, 'joint_card'), tx('80,00', 'Courses', null, 'joint_card')];
export const txnsOver = [...txnsUpTo82, tx('90,00', 'Courses', null, 'joint_card')];
export const fabienPaysCourses = tx('104,47', 'Courses', FABIEN, 'personal_card');
export const maelleVouchers = [tx('12,50', null, MAELLE, 'meal_voucher'), tx('45,00', null, MAELLE, 'meal_voucher')];

export const voucherIncomes = [{ membershipId: MAELLE, amount: eur('160,00'), isMealVoucher: true }];
