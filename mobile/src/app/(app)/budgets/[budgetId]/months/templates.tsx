import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TemplateSummary } from '@two-cents/shared/contracts';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { FontFamily, Spacing } from '@/constants/theme';
import { useCan } from '@/features/budgets/use-can';
import { planningApi } from '@/features/planning/api';
import { planningKeys } from '@/features/planning/query-keys';

/**
 * Month templates (US2, FR-007): save the month given as `fromMonth`, then rename or delete any
 * template. Creating a month from a template happens in the new-month sheet.
 */
export default function TemplatesScreen() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { budgetId, fromMonth } = useLocalSearchParams<{ budgetId: string; fromMonth?: string }>();
  const canWrite = useCan(budgetId, 'entries.write');
  const key = planningKeys.templates(budgetId);
  const templates = useQuery({ queryKey: key, queryFn: () => planningApi.templates(budgetId) });
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () => planningApi.createTemplate(budgetId, { name: name.trim(), fromMonthStart: fromMonth! }),
    onSuccess: (tpl) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(tpl.name);
      setName('');
      refresh();
    },
  });

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('planning.templates.title') }} />
      {fromMonth && canWrite ? (
        <Card>
          <TextField label={t('planning.month.templateName')} value={name} onChangeText={setName} maxLength={60} />
          <ErrorBanner message={create.error ? errorMessage(t, create.error) : null} />
          {saved ? (
            <ThemedText accessibilityLiveRegion="polite" type="smallBold">
              {t('planning.month.templateSaved', { name: saved })}
            </ThemedText>
          ) : null}
          <Button
            label={t('planning.month.saveTemplate')}
            disabled={name.trim().length === 0}
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
        </Card>
      ) : null}
      {templates.isPending ? <ActivityIndicator accessibilityLabel={t('common.loading')} /> : null}
      <ErrorBanner message={templates.error ? errorMessage(t, templates.error) : null} />
      {templates.data?.templates.length === 0 ? (
        <ThemedText themeColor="textSecondary">{t('planning.templates.empty')}</ThemedText>
      ) : null}
      {templates.data?.templates.map((tpl) => (
        <TemplateItem key={tpl.id} budgetId={budgetId} template={tpl} canWrite={canWrite} onChanged={refresh} />
      ))}
    </FormScreen>
  );
}

function TemplateItem({
  budgetId,
  template,
  canWrite,
  onChanged,
}: {
  budgetId: string;
  template: TemplateSummary;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const rename = useMutation({
    mutationFn: () => planningApi.renameTemplate(budgetId, template.id, name.trim()),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: () => planningApi.deleteTemplate(budgetId, template.id),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onChanged();
    },
  });
  const confirmDelete = () =>
    Alert.alert(t('planning.templates.deleteConfirm', { name: template.name }), undefined, [
      { text: t('planning.templates.cancel'), style: 'cancel' },
      { text: t('planning.templates.delete'), style: 'destructive', onPress: () => remove.mutate() },
    ]);

  return (
    <Card accessibilityLabel={`${template.name}, ${t('planning.templates.lines', { count: template.lineCount })}`}>
      {editing ? (
        <TextField
          label={t('planning.templates.renameTitle', { name: template.name })}
          value={name}
          onChangeText={setName}
          maxLength={60}
          autoFocus
        />
      ) : (
        <View>
          <ThemedText style={styles.title}>{template.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('planning.templates.lines', { count: template.lineCount })}
          </ThemedText>
        </View>
      )}
      <ErrorBanner
        message={rename.error ? errorMessage(t, rename.error) : remove.error ? errorMessage(t, remove.error) : null}
      />
      {canWrite ? (
        <View style={styles.actions}>
          {editing ? (
            <>
              <Button
                label={t('planning.templates.save')}
                disabled={name.trim().length === 0}
                loading={rename.isPending}
                onPress={() => rename.mutate()}
              />
              <Button variant="link" label={t('planning.templates.cancel')} onPress={() => setEditing(false)} />
            </>
          ) : (
            <>
              <Button variant="secondary" label={t('planning.templates.rename')} onPress={() => setEditing(true)} />
              <Button variant="link" label={t('planning.templates.delete')} loading={remove.isPending} onPress={confirmDelete} />
            </>
          )}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, lineHeight: 22, fontFamily: FontFamily.semibold },
  actions: { gap: Spacing.two },
});
