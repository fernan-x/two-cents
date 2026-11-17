import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category } from '@two-cents/shared/contracts';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, TextField } from '@/components/form';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { FontFamily, MinTouchTarget, Spacing } from '@/constants/theme';
import { useCan } from '@/features/budgets/use-can';
import { planningApi } from '@/features/planning/api';
import { planningKeys } from '@/features/planning/query-keys';
import { useTheme } from '@/hooks/use-theme';

/**
 * The budget's categories (US3, FR-014): add, rename, reorder with buttons, delete. Default
 * categories are translated while they keep their original name.
 */
export default function CategoriesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const client = useQueryClient();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const canWrite = useCan(budgetId, 'entries.write');
  const key = planningKeys.categories(budgetId);
  const categories = useQuery({ queryKey: key, queryFn: () => planningApi.categories(budgetId) });
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const done = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void client.invalidateQueries({ queryKey: key });
  };
  const create = useMutation({
    mutationFn: () => planningApi.createCategory(budgetId, { name: name.trim() }),
    onSuccess: () => {
      setName('');
      done();
    },
    onError: setError,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; name?: string; position?: number }) =>
      planningApi.updateCategory(budgetId, v.id, { ...(v.name ? { name: v.name } : {}), ...(v.position !== undefined ? { position: v.position } : {}) }),
    onSuccess: done,
    onError: setError,
  });
  const remove = useMutation({ mutationFn: (id: string) => planningApi.deleteCategory(budgetId, id), onSuccess: done, onError: setError });

  const list = [...(categories.data?.categories ?? [])].sort((a, b) => a.position - b.position);
  const label = (c: Category) => c.name ?? (c.systemKey ? t(`planning.categories.${c.systemKey}`) : '');

  async function move(index: number, delta: -1 | 1) {
    const a = list[index];
    const b = list[index + delta];
    if (!a || !b) return;
    void Haptics.selectionAsync();
    await update.mutateAsync({ id: a.id, position: b.position });
    await update.mutateAsync({ id: b.id, position: a.position });
  }

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('planning.categoriesScreen.title') }} />
      {categories.isPending ? <ActivityIndicator accessibilityLabel={t('common.loading')} /> : null}
      <ErrorBanner message={error ? errorMessage(t, error) : categories.error ? errorMessage(t, categories.error) : null} />
      <Card style={styles.list}>
        {list.map((c, i) => (
          <CategoryRow
            key={c.id}
            label={label(c)}
            divider={i > 0}
            borderColor={theme.border}
            canWrite={canWrite}
            first={i === 0}
            last={i === list.length - 1}
            busy={update.isPending}
            onRename={(next) => update.mutate({ id: c.id, name: next })}
            onMove={(delta) => void move(i, delta)}
            onDelete={() =>
              Alert.alert(t('planning.categoriesScreen.deleteConfirm', { name: label(c) }), undefined, [
                { text: t('planning.categoriesScreen.cancel'), style: 'cancel' },
                { text: t('planning.categoriesScreen.delete'), style: 'destructive', onPress: () => remove.mutate(c.id) },
              ])
            }
          />
        ))}
      </Card>
      {canWrite ? (
        <Card>
          <TextField label={t('planning.categoriesScreen.name')} value={name} onChangeText={setName} maxLength={40} />
          <Button
            label={t('planning.categoriesScreen.add')}
            disabled={name.trim().length === 0}
            loading={create.isPending}
            onPress={() => {
              setError(null);
              create.mutate();
            }}
          />
        </Card>
      ) : null}
    </FormScreen>
  );
}

function CategoryRow({
  label,
  divider,
  borderColor,
  canWrite,
  first,
  last,
  busy,
  onRename,
  onMove,
  onDelete,
}: {
  label: string;
  divider: boolean;
  borderColor: string;
  canWrite: boolean;
  first: boolean;
  last: boolean;
  busy: boolean;
  onRename: (name: string) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label);
  if (editing)
    return (
      <View style={[styles.editing, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: borderColor }]}>
        <TextField label={t('planning.categoriesScreen.name')} value={name} onChangeText={setName} maxLength={40} autoFocus />
        <Button
          label={t('planning.categoriesScreen.save')}
          disabled={name.trim().length === 0}
          onPress={() => {
            onRename(name.trim());
            setEditing(false);
          }}
        />
        <Button variant="link" label={t('planning.categoriesScreen.cancel')} onPress={() => setEditing(false)} />
      </View>
    );
  return (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: borderColor }]}>
      <ThemedText style={[styles.flex, styles.label]}>{label}</ThemedText>
      {canWrite ? (
        <>
          <IconButton icon="chevU" label={t('planning.categoriesScreen.moveUp', { name: label })} disabled={first || busy} onPress={() => onMove(-1)} />
          <IconButton icon="chevD" label={t('planning.categoriesScreen.moveDown', { name: label })} disabled={last || busy} onPress={() => onMove(1)} />
          <IconButton icon="edit" label={`${t('planning.categoriesScreen.rename')} ${label}`} onPress={() => setEditing(true)} />
          <IconButton icon="trash" label={`${t('planning.categoriesScreen.delete')} ${label}`} onPress={onDelete} />
        </>
      ) : null}
    </View>
  );
}

function IconButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevU' | 'chevD' | 'edit' | 'trash';
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={18} themeColor="primary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: Spacing.two, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MinTouchTarget },
  editing: { gap: Spacing.two, paddingVertical: Spacing.two },
  flex: { flex: 1 },
  label: { fontSize: 15, lineHeight: 20, fontFamily: FontFamily.semibold },
  icon: { width: MinTouchTarget, height: MinTouchTarget, alignItems: 'center', justifyContent: 'center' },
});
