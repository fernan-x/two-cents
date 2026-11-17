import type { LineView, MonthDetail } from '@two-cents/shared/contracts';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Amount } from '@/components/amount';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { FontFamily, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { formatMinor } from '@/features/budgets/format';
import { useTheme } from '@/hooks/use-theme';

import { formulaHint } from './formula-input';

type Member = MonthDetail['members'][number];

/**
 * One budget line: label, savings badge, total and the per-member shares. Read-only lines show a
 * lock and are not pressable (FR-018, viewers).
 */
export function LineRow({
  line,
  members,
  currency,
  onPress,
  divider,
  highlight,
}: {
  line: LineView;
  members: readonly Member[];
  currency: string;
  onPress?: () => void;
  divider?: boolean;
  /** Shown as "À vérifier" (e.g. returned by LINES_NEED_REVIEW). */
  highlight?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const name = (id: string) =>
    members.find((m) => m.membershipId === id)?.displayName ?? t('budgets.anonymousFormerMember');
  const money = (minor: string) => formatMinor(minor, currency, i18n.language);
  const shared = line.group !== 'personal';
  const shares = shared ? line.shares.filter((s) => s.amountMinor !== '0') : [];
  const a11y = [
    t('planning.line.a11y', { label: line.label, total: money(line.totalMinor) }),
    ...shares.map((s) => t('planning.line.a11yShare', { name: name(s.membershipId), amount: money(s.amountMinor) })),
    line.kind === 'savings' ? t('planning.kinds.savings') : null,
    line.formula ? formulaHint(t, line.formula, currency, i18n.language) : null,
    line.isException && line.usualTotalMinor ? t('planning.exception', { amount: money(line.usualTotalMinor) }) : null,
    line.needsReview || highlight ? t('planning.month.needsReview') : null,
    line.needsIncome ? t('planning.month.needsIncome') : null,
    !line.editable && line.ownerMembershipId ? t('planning.line.locked', { name: name(line.ownerMembershipId) }) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const editable = line.editable && !!onPress;

  return (
    <Pressable
      accessibilityRole={editable ? 'button' : 'text'}
      accessibilityLabel={a11y}
      disabled={!editable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
        { opacity: pressed ? 0.7 : 1 },
      ]}>
      <View style={styles.main} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.titleRow}>
          <ThemedText style={styles.label} numberOfLines={2}>
            {line.label}
          </ThemedText>
          {line.kind === 'savings' ? (
            <View style={[styles.badge, { backgroundColor: theme.successBackground }]}>
              <ThemedText type="small">{t('planning.kinds.savings')}</ThemedText>
            </View>
          ) : null}
        </View>
        {line.formula ? (
          <ThemedText type="small" themeColor="textSecondary">
            {formulaHint(t, line.formula, currency, i18n.language)}
          </ThemedText>
        ) : null}
        {line.isException && line.usualTotalMinor ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('planning.exception', { amount: money(line.usualTotalMinor) })}
          </ThemedText>
        ) : null}
        {line.needsReview || highlight ? (
          <View style={styles.flag}>
            <Icon name="alert" size={14} color={theme.warning} />
            <ThemedText type="smallBold">{t('planning.month.needsReview')}</ThemedText>
          </View>
        ) : null}
        {line.needsIncome ? (
          <View style={styles.flag}>
            <Icon name="info" size={14} themeColor="textSecondary" />
            <ThemedText type="small">{t('planning.month.needsIncome')}</ThemedText>
          </View>
        ) : null}
        {shares.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {shares.map((s) => `${name(s.membershipId)} ${money(s.amountMinor)}`).join(' · ')}
          </ThemedText>
        ) : null}
      </View>
      <Amount minor={line.totalMinor} currency={currency} style={styles.total} />
      {editable ? (
        <Icon name="chevR" size={16} themeColor="textSecondary" />
      ) : (
        <Icon name="lock" size={16} themeColor="textSecondary" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: MinTouchTarget,
    paddingVertical: Spacing.two,
  },
  main: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexWrap: 'wrap' },
  label: { fontSize: 15, lineHeight: 20, fontFamily: FontFamily.semibold, flexShrink: 1 },
  badge: { borderRadius: Radius.full, paddingHorizontal: Spacing.two },
  total: { fontFamily: FontFamily.semibold },
  flag: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
