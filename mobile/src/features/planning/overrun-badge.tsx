import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A negative "what's left": icon and the word "Dépassement", never color alone (FR-032, Principle VIII). */
export function OverrunBadge() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={t('planning.overrun')}
      style={[styles.badge, { backgroundColor: theme.dangerBackground }]}>
      <Icon name="alert" size={14} color={theme.danger} />
      {/* Ink text: the danger pink is below 4.5:1 for text (Principle VIII); the icon and pill carry the tone. */}
      <ThemedText type="smallBold">
        {t('planning.overrun')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.full,
  },
});
