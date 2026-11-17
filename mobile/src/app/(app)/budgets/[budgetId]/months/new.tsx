import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMonthRequest } from '@two-cents/shared/contracts';
import { addDays } from '@two-cents/shared/domain';
import * as Haptics from 'expo-haptics';
import { type Href, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/auth/api-client';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { ChoiceRow } from '@/features/budgets/components';
import { useBudget } from '@/features/budgets/use-can';
import { planningApi } from '@/features/planning/api';
import { monthTitle } from '@/features/planning/month-label';
import { planningKeys } from '@/features/planning/query-keys';
import { useTheme } from '@/hooks/use-theme';

type SourceKind = 'previous' | 'month' | 'template' | 'scratch';

/**
 * Create a month (US2, US7, FR-004): for the current or next period (or a given one), from the
 * previous month (default), a past month used as a basis (optionally with its one-off lines), a
 * template, or scratch.
 */
export default function NewMonthSheet() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ budgetId: string; period?: string; from?: string }>();
  const { budgetId } = params;
  const budget = useBudget(budgetId);
  const templates = useQuery({ queryKey: planningKeys.templates(budgetId), queryFn: () => planningApi.templates(budgetId) });

  const current = budget.data?.currentMonth;
  const periods = current
    ? [...new Set([...(params.period ? [params.period] : []), current.start, addDays(current.end, 1)])]
    : params.period
      ? [params.period]
      : [];
  const [period, setPeriod] = useState<string | null>(params.period ?? null);
  const [source, setSource] = useState<SourceKind>(params.from ? 'month' : 'previous');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [includeOneOff, setIncludeOneOff] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const chosen = period ?? periods[0] ?? null;

  // A period's label without knowing its end: the start month is enough to name it in the list.
  const label = (start: string) =>
    current && start === current.start ? monthTitle(current, i18n.language) : monthTitle({ start, end: addDays(start, 27) }, i18n.language);

  const body = (): CreateMonthRequest['source'] | null => {
    if (source === 'template') return templateId ? { kind: 'template', templateId } : null;
    if (source === 'month') return params.from ? { kind: 'month', monthStart: params.from, includeOneOff } : null;
    return { kind: source };
  };

  async function create() {
    const src = body();
    if (!chosen || !src) return;
    setError(null);
    setBusy(true);
    try {
      const detail = await planningApi.createMonth(budgetId, { periodStart: chosen, source: src });
      client.setQueryData(planningKeys.month(budgetId, chosen), detail);
      void client.invalidateQueries({ queryKey: planningKeys.months(budgetId) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/budgets/${budgetId}/months/${chosen}` as Href);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const exists = error instanceof ApiError && error.code === 'MONTH_EXISTS';
  const noPrevious = error instanceof ApiError && error.code === 'INVALID_MONTH' && source === 'previous';

  return (
    <FormScreen title={t('planning.new.title')}>
      <Stack.Screen options={{ title: t('planning.new.title') }} />
      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('planning.new.period')}>
        <ThemedText type="smallBold">{t('planning.new.period')}</ThemedText>
        {periods.map((p) => (
          <ChoiceRow key={p} label={label(p)} selected={chosen === p} onPress={() => setPeriod(p)} />
        ))}
      </View>

      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('planning.new.source')}>
        <ThemedText type="smallBold">{t('planning.new.source')}</ThemedText>
        {params.from ? (
          <ChoiceRow
            label={t('planning.new.fromMonth', { month: label(params.from) })}
            selected={source === 'month'}
            onPress={() => setSource('month')}
          />
        ) : null}
        <ChoiceRow
          label={t('planning.new.previous')}
          detail={t('planning.new.previousDetail')}
          selected={source === 'previous'}
          onPress={() => setSource('previous')}
        />
        <ChoiceRow
          label={t('planning.new.template')}
          selected={source === 'template'}
          disabled={!templates.data?.templates.length}
          detail={templates.data && !templates.data.templates.length ? t('planning.new.noTemplates') : undefined}
          onPress={() => setSource('template')}
        />
        <ChoiceRow label={t('planning.new.scratch')} selected={source === 'scratch'} onPress={() => setSource('scratch')} />
      </View>

      {source === 'template' && templates.data ? (
        <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('planning.templates.title')}>
          {templates.data.templates.map((tpl) => (
            <ChoiceRow
              key={tpl.id}
              label={tpl.name}
              detail={t('planning.templates.lines', { count: tpl.lineCount })}
              selected={templateId === tpl.id}
              onPress={() => setTemplateId(tpl.id)}
            />
          ))}
        </View>
      ) : null}

      {source === 'month' ? (
        <View style={styles.switchRow}>
          <ThemedText type="smallBold" style={styles.flex}>
            {t('planning.new.includeOneOff')}
          </ThemedText>
          <Switch
            accessibilityLabel={t('planning.new.includeOneOff')}
            value={includeOneOff}
            onValueChange={setIncludeOneOff}
            trackColor={{ true: theme.primary, false: theme.track }}
          />
        </View>
      ) : null}

      {noPrevious ? (
        <ThemedText type="smallBold" accessibilityLiveRegion="polite">
          {t('planning.new.noPrevious')}
        </ThemedText>
      ) : exists ? (
        <>
          <ThemedText type="smallBold">{t('planning.new.exists')}</ThemedText>
          <Button
            variant="secondary"
            label={t('planning.new.open')}
            onPress={() => router.replace(`/budgets/${budgetId}/months/${chosen}` as Href)}
          />
        </>
      ) : (
        <ErrorBanner message={error ? errorMessage(t, error) : null} />
      )}
      <Button label={t('planning.new.create')} disabled={!chosen || !body()} loading={busy} onPress={() => void create()} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchTarget },
  flex: { flex: 1 },
});
