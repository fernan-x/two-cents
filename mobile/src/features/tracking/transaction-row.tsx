import type { LineView, MonthMemberView } from '@two-cents/shared/contracts';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Amount } from '@/components/amount';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { LocalTransaction } from './mutations';
import { StateBadge, SyncBadge } from './tracking-cards';

/** One transaction in a list (US5): label, amount, line or "Non affectée", payer, planned/unplanned, sync state. */
export function TransactionRow({
  row,
  lines,
  members,
  onPress,
}: {
  row: LocalTransaction;
  lines: readonly LineView[];
  members: readonly MonthMemberView[];
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const nameOf = (id: string) => members.find((m) => m.membershipId === id)?.displayName ?? t('planning.history.someone');
  if (row.private)
    return (
      <View style={[styles.row, { borderBottomColor: theme.border }]} accessible accessibilityLabel={`${t('tracking.private')}, ${nameOf(row.ownerMembershipId)}`}>
        <ThemedText themeColor="textSecondary">
          {t('tracking.private')} · {nameOf(row.ownerMembershipId)}
        </ThemedText>
      </View>
    );
  const lineNames = row.parts.map((p) => (p.lineId ? (lines.find((l) => l.id === p.lineId)?.label ?? '') : t('tracking.unassigned')));
  const payer = row.payer.kind === 'joint' ? t('tracking.jointAccount') : nameOf(row.payer.membershipId);
  const detail = [lineNames.length ? lineNames.join(' + ') : t('tracking.unassigned'), payer, row.isPlanned ? t('tracking.planned') : t('tracking.unplanned')].join(' · ');
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${row.label}, ${detail}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.text}>
        <ThemedText numberOfLines={1}>{row.label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {detail}
        </ThemedText>
        {row._pending ? <SyncBadge /> : null}
        {row.parts.some((p) => p.needsReview) ? <StateBadge icon="alert" tone="warning" label={t('tracking.needsReview')} /> : null}
        {row.origin === 'recurring' ? <StateBadge icon="repeat" tone="primary" label={t('tracking.recurringBadge')} /> : null}
      </View>
      <Amount minor={row.amountMinor} currency={row.currency} type="smallBold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    minHeight: MinTouchTarget,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: Spacing.half },
});
