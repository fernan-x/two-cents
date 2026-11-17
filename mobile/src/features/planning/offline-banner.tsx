import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useIsOnline } from './online';

/** "Hors ligne — modifications indisponibles", shown only while offline (research R17). */
export function OfflineBanner() {
  const { t } = useTranslation();
  const theme = useTheme();
  const online = useIsOnline();
  if (online) return null;
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={t('planning.offline')}
      style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Icon name="alert" size={18} themeColor="text" />
      <ThemedText type="smallBold" style={styles.text}>
        {t('planning.offline')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two + Spacing.one,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1 },
});
