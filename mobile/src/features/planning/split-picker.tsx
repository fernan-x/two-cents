import type { MonthDetail, SplitMode } from '@two-cents/shared/contracts';
import { countedIncomeOf } from '@two-cents/shared/domain';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { ChoiceRow } from '@/features/budgets/components';

const MODES: SplitMode[] = ['custom', 'equal', 'proportional', 'one_payer'];

/** Household-counted income per member for this month (FR-022), from the detail. */
export function countedIncomes(detail: MonthDetail) {
  return detail.incomes.map((i) => ({
    membershipId: i.membershipId,
    amount: BigInt(i.amountMinor),
    counts: i.countsTowardHousehold,
  }));
}

/**
 * How a shared line is split (FR-017): custom amounts, equal, proportional to this month's counted
 * income (disabled with an explanation when there is none), or one member pays everything.
 */
export function SplitPicker({
  detail,
  mode,
  payer,
  onChange,
}: {
  detail: MonthDetail;
  mode: SplitMode;
  payer: string | null;
  onChange: (mode: SplitMode, payer: string | null) => void;
}) {
  const { t } = useTranslation();
  const incomes = countedIncomes(detail);
  const counted = detail.members.map((m) => ({ m, v: countedIncomeOf(m.membershipId, incomes) }));
  const totalIncome = counted.reduce((s, x) => s + x.v, 0n);
  const name = (id: string) =>
    detail.members.find((m) => m.membershipId === id)?.displayName ?? t('budgets.anonymousFormerMember');
  const percents =
    totalIncome > 0n
      ? counted
          .map(({ m, v }) =>
            t('planning.split.percent', {
              name: name(m.membershipId),
              value: Number((v * 1000n + totalIncome / 2n) / totalIncome) / 10,
            }),
          )
          .join(' · ')
      : t('planning.split.proportionalDisabled');
  const detailOf = (m: SplitMode) => (m === 'proportional' ? percents : undefined);
  const label = (m: SplitMode) =>
    m === 'equal'
      ? t(detail.members.length === 2 ? 'planning.split.equal' : 'planning.split.equalN')
      : m === 'one_payer'
        ? t('planning.split.onePayer')
        : t(`planning.split.${m}`);

  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('planning.split.title')}>
      <ThemedText type="smallBold">{t('planning.split.title')}</ThemedText>
      {MODES.map((m) => (
        <ChoiceRow
          key={m}
          label={label(m)}
          detail={detailOf(m)}
          selected={mode === m}
          disabled={m === 'proportional' && totalIncome === 0n && mode !== 'proportional'}
          onPress={() => onChange(m, m === 'one_payer' ? (payer ?? detail.members.find((x) => x.isMe)?.membershipId ?? null) : null)}
        />
      ))}
      {mode === 'one_payer' ? (
        <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('planning.split.payer')}>
          <ThemedText type="smallBold">{t('planning.split.payer')}</ThemedText>
          {detail.members.map((m) => (
            <ChoiceRow
              key={m.membershipId}
              label={name(m.membershipId)}
              selected={payer === m.membershipId}
              onPress={() => onChange('one_payer', m.membershipId)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: Spacing.two } });
