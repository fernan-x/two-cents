import { type Href, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ListRow } from '@/components/ui';

import { useSyncState } from './use-sync-state';

/** Points to "À résoudre" when a write was refused (FR-016). */
export function SyncBanner({ budgetId }: { budgetId: string }) {
  const { t } = useTranslation();
  const { failed } = useSyncState();
  const count = failed.filter((m) => (m.state.variables as { budgetId?: string } | undefined)?.budgetId === budgetId).length;
  if (count === 0) return null;
  return (
    <ListRow
      icon="alert"
      tone="warning"
      title={t('tracking.sync.failed')}
      detail={`${t('tracking.toResolve')} · ${count}`}
      onPress={() => router.push(`/budgets/${budgetId}/transactions/pending` as Href)}
    />
  );
}
