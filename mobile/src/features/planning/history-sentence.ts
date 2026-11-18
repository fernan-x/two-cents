import type { ChangeView } from '@two-cents/shared/contracts';
import type { TFunction } from 'i18next';

import { formatMinor } from '@/features/budgets/format';

/**
 * One history entry as a sentence (FR-035): "Fabien a modifié Courses de 280,00 € à 300,00 €".
 * Built from the structured record so it follows the person's language (Principle VI). A private
 * line of someone else only says that a private line changed.
 */
export function historySentence(
  change: ChangeView,
  options: { t: TFunction; currency: string; language: string },
): string {
  const { t, currency, language } = options;
  const actor =
    change.actor?.displayName ??
    (change.actor?.formerMember ? t('budgets.anonymousFormerMember') : t('planning.history.someone'));
  const label = change.label ?? '';
  const field = (name: string) => change.changes.find((c) => c.field === name);
  const money = (minor: string | null | undefined) => (minor ? formatMinor(minor, currency, language) : '');

  if (change.entity === 'transaction') {
    // Spec 004 FR-020: transactions, with the private variant for another member's private line.
    if (change.private) return t('tracking.history.transaction_private', { actor });
    if (change.cause === 'recurring') return t('tracking.history.transaction_recurring', { label });
    if (change.cause === 'import') return t('tracking.history.transaction_imported', { actor, label });
    const amount = field('amountMinor');
    if (change.action === 'created')
      return t('tracking.history.transaction_created', { actor, label, amount: money(amount?.new) });
    if (change.action === 'deleted')
      return t('tracking.history.transaction_deleted', { actor, label, amount: money(amount?.old) });
    if (amount)
      return t('tracking.history.transaction_updated_amount', { actor, label, old: money(amount.old), new: money(amount.new) });
    return t('tracking.history.transaction_updated', { actor, label });
  }
  if (change.entity === 'settlement')
    return t('tracking.history.settlement_created', { actor, amount: money(field('amountMinor')?.new) });
  if (change.entity === 'recurring_rule') return t('tracking.history.recurring_rule', { actor, label });
  if (change.cause === 'import') return t('planning.history.cause_import');
  if (change.private) return t('planning.history.line_private', { actor });
  if (change.cause === 'recompute') return t('planning.history.cause_recompute', { label });

  switch (change.entity) {
    case 'line': {
      if (change.cause === 'propagation') return t('planning.history.cause_propagation', { actor, label });
      if (change.action === 'created') return t('planning.history.line_created', { actor, label });
      if (change.action === 'deleted') return t('planning.history.line_deleted', { actor, label });
      const total = field('totalMinor');
      if (total)
        return t('planning.history.line_updated_amount', { actor, label, old: money(total.old), new: money(total.new) });
      return t('planning.history.line_updated', { actor, label });
    }
    case 'income': {
      const amount = field('amountMinor');
      if (change.action === 'created') return t('planning.history.income_created', { actor, new: money(amount?.new) });
      if (change.action === 'deleted') return t('planning.history.income_deleted', { actor });
      if (change.action === 'confirmed') return t('planning.history.income_confirmed', { actor });
      if (amount)
        return t('planning.history.income_updated', { actor, old: money(amount.old), new: money(amount.new) });
      return t('planning.history.income_updated_other', { actor, label: label || t('planning.defaultIncome') });
    }
    case 'month':
      return t(`planning.history.month_${change.action}`, { actor });
    case 'order':
      return t('planning.history.order_reordered', { actor });
  }
}
