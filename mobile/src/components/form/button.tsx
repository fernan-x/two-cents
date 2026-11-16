import { ActivityIndicator, Pressable, type PressableProps, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'link';
  loading?: boolean;
}

export function Button({ label, variant = 'primary', loading = false, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const background =
    variant === 'primary' ? theme.primary : variant === 'danger' ? theme.danger : variant === 'secondary' ? theme.backgroundElement : 'transparent';
  const color = variant === 'primary' ? theme.onPrimary : variant === 'danger' ? theme.background : variant === 'link' ? theme.primary : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        variant !== 'link' && styles.filled,
        { backgroundColor: background, opacity: isDisabled ? 0.6 : state.pressed ? 0.85 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText type="smallBold" style={[styles.label, { color }]}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: MinTouchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  filled: { borderRadius: Radius.md, minHeight: MinTouchTarget + Spacing.two },
  label: { fontSize: 17 },
});
