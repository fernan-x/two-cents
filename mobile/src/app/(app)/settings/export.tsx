import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/auth/api-client';
import { refreshTokens } from '@/auth/bootstrap';
import { errorMessage } from '@/auth/error-message';
import { tokenStore } from '@/auth/token-store';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { config } from '@/config';

/** US8: download all personal data (ZIP of JSON + CSV) and open the share sheet (FR-040). */
export default function ExportData() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download(): Promise<File> {
    const destination = new File(Paths.cache, `two-cents-export-${new Date().toISOString().slice(0, 10)}.zip`);
    if (destination.exists) destination.delete();
    const attempt = () =>
      File.downloadFileAsync(`${config.apiUrl}/v1/me/export`, destination, {
        headers: { Authorization: `Bearer ${tokenStore.get() ?? ''}` },
      });
    try {
      return await attempt();
    } catch (e) {
      // The access token may simply have expired: refresh once and retry.
      if (await refreshTokens().catch(() => false)) return attempt();
      throw e;
    }
  }

  async function exportData() {
    setBusy(true);
    setError(null);
    try {
      const file = await download();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: t('export.title') });
      }
    } catch (e) {
      setError(errorMessage(t, e instanceof ApiError ? e : new ApiError('NETWORK', 0)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('export.title') }} />
      <ThemedText>{t('export.body')}</ThemedText>
      <ErrorBanner message={error} />
      <Button label={t('export.action')} loading={busy} onPress={() => void exportData()} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('export.limit')}
      </ThemedText>
    </FormScreen>
  );
}
