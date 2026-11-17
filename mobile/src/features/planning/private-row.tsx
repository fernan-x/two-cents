import type { PrivateAggregateView } from '@two-cents/shared/contracts';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Amount } from '@/components/amount';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { FontFamily, MinTouchTarget, Spacing } from '@/constants/theme';
import { formatMinor } from '@/features/budgets/format';
import { useTheme } from '@/hooks/use-theme';

/**
 * Another member's private lines, as one "Privé" amount (FR-019). No label, no detail, no action:
 * the server never sent them (research R10).
 */
export function PrivateRow({
  aggregate,
  currency,
  divider,
}: {
  aggregate: PrivateAggregateView;
  currency: string;
  divider?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={t('planning.privacy.rowA11y', {
        count: aggregate.count,
        amount: formatMinor(aggregate.totalMinor, currency, i18n.language),
      })}
      style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <Icon name="lock" size={16} themeColor="textSecondary" />
      <ThemedText style={[styles.label, styles.flex]}>{t('planning.private')}</ThemedText>
      <Amount minor={aggregate.totalMinor} currency={currency} style={styles.label} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchTarget, paddingVertical: Spacing.two },
  flex: { flex: 1 },
  label: { fontSize: 15, lineHeight: 20, fontFamily: FontFamily.semibold },
});
