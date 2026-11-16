import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, type TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget } from '@/constants/theme';
import { TextField, type TextFieldProps } from './text-field';

/** Password input with a show/hide toggle. */
export const PasswordField = forwardRef<React.ComponentRef<typeof TextInput>, TextFieldProps>(function PasswordField(props, ref) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      ref={ref}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      trailing={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={visible ? t('common.hidePassword') : t('common.showPassword')}
          hitSlop={8}
          style={styles.toggle}>
          <ThemedText type="small" themeColor="textSecondary">
            {visible ? '🙈' : '👁'}
          </ThemedText>
        </Pressable>
      }
    />
  );
});

const styles = StyleSheet.create({
  toggle: { minWidth: MinTouchTarget, minHeight: MinTouchTarget, alignItems: 'center', justifyContent: 'center' },
});
