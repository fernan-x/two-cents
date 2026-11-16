import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Error message with an icon, so meaning never relies on color alone (Principle VIII). */
export function ErrorBanner({ message }: { message: string | null }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <View
      style={[styles.banner, { backgroundColor: theme.dangerBackground }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive">
      <ThemedText style={{ color: theme.danger }}>⚠︎ {message}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: Radius.md, padding: Spacing.three },
});
