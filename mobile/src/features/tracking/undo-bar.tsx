import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';

import { undoDelete, useScheduledDeletes } from './undo-delete';

/** "Dépense supprimée — Annuler" while a deletion waits its 10 s (FR-019). */
export function UndoBar() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const pending = useScheduledDeletes();
  if (pending.length === 0) return null;
  return (
    <Card>
      {pending.map((d) => (
        <View key={d.txnId} style={styles.row} accessibilityLiveRegion="polite">
          <ThemedText style={styles.flex}>{t('tracking.detail.deleted')}</ThemedText>
          <Button label={t('tracking.detail.undo')} variant="secondary" onPress={() => undoDelete(client, d.txnId)} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, flex: { flex: 1 } });
