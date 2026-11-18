import { type Href, router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { CardShadow, Spacing } from '@/constants/theme';
import { useCan } from '@/features/budgets/use-can';
import { useTheme } from '@/hooks/use-theme';

export const QUICK_ADD_SIZE = 56;

/** Screens of a budget where the "+" shows (sheets and forms hide it so it never covers inputs). */
const SHOWN_ON = [
  /^\/budgets\/[^/]+$/,
  /^\/budgets\/[^/]+\/months$/,
  /^\/budgets\/[^/]+\/months\/[^/]+$/,
  /^\/budgets\/[^/]+\/months\/[^/]+\/(tracking|transactions)$/,
  /^\/budgets\/[^/]+\/months\/[^/]+\/envelope\/[^/]+$/,
];

/** The persistent "+" (US1, FR-007): one tap from any main screen of the budget to the keypad. */
export function QuickAddButton({ budgetId }: { budgetId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const canWrite = useCan(budgetId, 'transactions.write');
  if (!canWrite || !SHOWN_ON.some((re) => re.test(pathname))) return null;
  return (
    <Pressable
      testID="quick-add"
      accessibilityRole="button"
      accessibilityLabel={t('tracking.add')}
      // Typed routes regenerate on the next `expo start`; the cast covers this new route until then.
      onPress={() => router.push(`/budgets/${budgetId}/transactions/new` as Href)}
      style={({ pressed }) => [
        styles.button,
        CardShadow,
        { backgroundColor: pressed ? theme.primaryDark : theme.primary, bottom: insets.bottom + Spacing.three, right: insets.right + Spacing.three },
      ]}>
      <Icon name="plus" size={28} color={theme.onPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: QUICK_ADD_SIZE,
    height: QUICK_ADD_SIZE,
    borderRadius: QUICK_ADD_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
