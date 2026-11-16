import { AVATAR_KEYS, COLOR_KEYS, Me, type AvatarKey, type ColorKey, type Locale } from '@two-cents/shared/contracts';
import { validateFirstName } from '@two-cents/shared/domain';
import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { apiRequest } from '@/auth/api-client';
import { useAuth } from '@/auth/auth-store';
import { errorMessage } from '@/auth/error-message';
import { Avatar } from '@/components/avatar';
import { Button, ErrorBanner, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD'] as const;

/** US6: edit the profile shown to the household. */
export default function Profile() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const auth = useAuth();
  const me = auth.me!;
  const [firstName, setFirstName] = useState(me.firstName);
  const [avatarKey, setAvatarKey] = useState<AvatarKey>(me.avatarKey);
  const [colorKey, setColorKey] = useState<ColorKey>(me.colorKey);
  const [locale, setLocale] = useState<Locale>(me.locale);
  const [currency, setCurrency] = useState(me.currency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameOk = validateFirstName(firstName).ok;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiRequest('PATCH', '/v1/me', {
        body: { firstName, avatarKey, colorKey, locale, currency },
        schema: Me,
      });
      auth.setMe(updated);
      await i18n.changeLanguage(updated.locale);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setSaving(false);
    }
  }

  const chip = (selected: boolean) => [
    styles.chip,
    { borderColor: selected ? theme.primary : theme.border, borderWidth: selected ? 3 : 1 },
  ];

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('profile.title') }} />
      <View style={styles.center}>
        <Avatar firstName={firstName || me.firstName} avatarKey={avatarKey} colorKey={colorKey} size={72} />
      </View>
      <TextField
        label={t('auth.firstName')}
        hint={t('auth.firstNameHint')}
        value={firstName}
        onChangeText={setFirstName}
        maxLength={50}
        error={nameOk ? null : t('profile.nameRequired')}
      />

      <ThemedText type="smallBold">{t('profile.avatar')}</ThemedText>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {AVATAR_KEYS.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ checked: avatarKey === key }}
            accessibilityLabel={t(`profile.avatars.${key}`)}
            onPress={() => setAvatarKey(key)}
            style={chip(avatarKey === key)}>
            <Avatar firstName={firstName || me.firstName} avatarKey={key} colorKey={colorKey} size={40} />
          </Pressable>
        ))}
      </View>

      <ThemedText type="smallBold">{t('profile.color')}</ThemedText>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {COLOR_KEYS.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ checked: colorKey === key }}
            accessibilityLabel={t(`profile.colors.${key}`)}
            onPress={() => setColorKey(key)}
            style={chip(colorKey === key)}>
            <Avatar firstName={firstName || me.firstName} avatarKey="initials" colorKey={key} size={40} />
          </Pressable>
        ))}
      </View>

      <ThemedText type="smallBold">{t('profile.language')}</ThemedText>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {(['fr', 'en'] as const).map((key) => (
          <Button
            key={key}
            label={t(`profile.languages.${key}`)}
            variant={locale === key ? 'primary' : 'secondary'}
            accessibilityRole="radio"
            accessibilityState={{ checked: locale === key }}
            onPress={() => setLocale(key)}
          />
        ))}
      </View>

      <ThemedText type="smallBold">{t('profile.currency')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('profile.currencyHint')}
      </ThemedText>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {CURRENCIES.map((code) => (
          <Button
            key={code}
            label={code}
            variant={currency === code ? 'primary' : 'secondary'}
            accessibilityRole="radio"
            accessibilityState={{ checked: currency === code }}
            onPress={() => setCurrency(code)}
          />
        ))}
      </View>

      <ErrorBanner message={error} />
      <Button label={t('profile.save')} loading={saving} disabled={!nameOk} onPress={() => void save()} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { minWidth: MinTouchTarget, minHeight: MinTouchTarget, borderRadius: Radius.full, padding: Spacing.half, alignItems: 'center', justifyContent: 'center' },
});
