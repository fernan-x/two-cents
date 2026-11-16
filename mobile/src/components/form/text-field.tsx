import { forwardRef } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
  trailing?: React.ReactNode;
}

/** Labelled input; the error is announced to screen readers (constitution Principle VIII). */
export const TextField = forwardRef<React.ComponentRef<typeof TextInput>, TextFieldProps>(function TextField(
  { label, error, hint, trailing, style, ...input },
  ref,
) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: theme.backgroundElement, borderColor: error ? theme.danger : theme.border },
        ]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }, style]}
          {...input}
        />
        {trailing}
      </View>
      {hint && !error ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    minHeight: MinTouchTarget + Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  input: { flex: 1, fontSize: 17, paddingVertical: Spacing.two },
});
