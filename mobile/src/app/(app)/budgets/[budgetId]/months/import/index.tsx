import { type Href, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card, IconLabel } from '@/components/ui';
import { importStore } from '@/features/planning/import/import-store';
import { pickWorkbook } from '@/features/planning/import/read-workbook';

/** US8: pick a .xlsx or .ods spreadsheet; it is parsed on the phone, then previewed (research R16). */
export default function ImportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await pickWorkbook();
      if (result.kind === 'cancelled') return;
      if (result.kind === 'unsupported') return setError(t('planning.import.unsupported', { name: result.fileName }));
      if (result.kind === 'unreadable') return setError(t('planning.import.unreadable', { name: result.fileName }));
      importStore.set(budgetId, result.workbook);
      router.push(`/budgets/${budgetId}/months/import/preview` as Href);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('planning.import.title') }} />
      <Card>
        <ThemedText>{t('planning.import.intro')}</ThemedText>
        <IconLabel icon="info" label={t('planning.import.formats')} />
      </Card>
      <ErrorBanner message={error} />
      <Button label={t('planning.import.pick')} loading={busy} onPress={() => void pick()} />
    </FormScreen>
  );
}
