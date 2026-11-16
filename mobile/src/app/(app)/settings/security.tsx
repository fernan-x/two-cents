import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { type LockSettings, secureStorage } from '@/auth/secure-storage';
import { ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { biometricMarker } from '@/lock/biometric-marker';
import { applyPrivacyScreen } from '@/lock/privacy-screen';

/** US5: biometric unlock and "require on every open", saved for this device only. */
export default function SecuritySettings() {
  const { t } = useTranslation();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<LockSettings>({ biometricEnabled: false, requireOnEveryOpen: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void biometricMarker.isAvailable().then(setAvailable);
    void secureStorage.getLockSettings().then(setSettings);
  }, []);

  async function save(next: LockSettings) {
    setSettings(next);
    await secureStorage.setLockSettings(next);
    await applyPrivacyScreen(next.requireOnEveryOpen);
  }

  async function toggleBiometric(enabled: boolean) {
    setError(null);
    if (!enabled) {
      await biometricMarker.disable();
      return save({ biometricEnabled: false, requireOnEveryOpen: settings.requireOnEveryOpen });
    }
    const ok = await biometricMarker.enable(t('lock.enablePrompt'));
    if (!ok) {
      setError(t('lock.enableFailed'));
      return;
    }
    await save({ ...settings, biometricEnabled: true });
  }

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('lock.settingsTitle') }} />
      {available === false ? <ThemedText themeColor="textSecondary">{t('lock.unavailable')}</ThemedText> : null}
      <Row
        label={t('lock.biometricToggle')}
        hint={t('lock.biometricHint')}
        value={settings.biometricEnabled}
        disabled={!available}
        onChange={(v) => void toggleBiometric(v)}
      />
      <Row
        label={t('lock.everyOpenToggle')}
        hint={t('lock.everyOpenHint')}
        value={settings.requireOnEveryOpen}
        onChange={(v) => void save({ ...settings, requireOnEveryOpen: v })}
      />
      <ErrorBanner message={error} />
    </FormScreen>
  );
}

function Row(props: { label: string; hint: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <ThemedText>{props.label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {props.hint}
        </ThemedText>
      </View>
      <Switch
        accessibilityLabel={props.label}
        accessibilityHint={props.hint}
        value={props.value}
        disabled={props.disabled}
        onValueChange={props.onChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: MinTouchTarget },
  text: { flex: 1, gap: Spacing.half },
});
