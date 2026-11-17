import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CATEGORY_SYSTEM_KEYS, type ImportPreviewResult } from '@two-cents/shared/contracts';
import {
  budgetMonthFor,
  type Group,
  type Kind,
  monthLabelFor,
  proposeSheetMapping,
  type ProposedRow,
} from '@two-cents/shared/domain';
import * as Haptics from 'expo-haptics';
import { type Href, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Amount } from '@/components/amount';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Card, IconLabel } from '@/components/ui';
import { FontFamily, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { formatMinor } from '@/features/budgets/format';
import { ChoiceRow } from '@/features/budgets/components';
import { useBudget } from '@/features/budgets/use-can';
import { planningApi } from '@/features/planning/api';
import { AmountField } from '@/features/planning/amount-field';
import {
  blockingRows,
  buildImportRequest,
  effectiveRow,
  importBlocker,
  periodStartFor,
  type RowEdit,
  type SheetState,
} from '@/features/planning/import/build-import';
import { importStore } from '@/features/planning/import/import-store';
import { monthTitle } from '@/features/planning/month-label';
import { planningKeys } from '@/features/planning/query-keys';
import { useTheme } from '@/hooks/use-theme';

type Preview = ImportPreviewResult['months'][number];
const GROUPS: Group[] = ['personal', 'recurring_shared', 'one_off_shared'];
const KINDS: Kind[] = ['expense', 'savings'];
const DRY_RUN_DELAY_MS = 500;

/** Start of the month before/after `start`, for a budget whose months start on `startDay`. */
function shiftPeriod(start: string, startDay: number, by: number): string {
  const { year, month } = monthLabelFor(budgetMonthFor(start, [{ effectiveFrom: '1900-01-01', startDay }]));
  const d = new Date(Date.UTC(year, month - 1 + by, 1));
  return periodStartFor({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }, startDay);
}

/**
 * US8 preview (FR-040–FR-043): each sheet becomes a month; every row can be corrected or skipped.
 * The server recomputes each month after every change (a debounced dry run) and its "what's left"
 * is shown next to the spreadsheet's own. Nothing is saved until "Importer".
 */
export default function ImportPreviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const client = useQueryClient();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId);
  const categories = useQuery({
    queryKey: planningKeys.categories(budgetId),
    queryFn: () => planningApi.categories(budgetId),
  });
  const workbook = importStore.get(budgetId);
  const currency = budget.data?.currency ?? 'EUR';
  const startDay = budget.data?.monthStartDay ?? 1;
  const members = useMemo(
    () =>
      (budget.data?.members ?? [])
        .filter((m) => m.role !== 'viewer')
        .map((m) => ({ membershipId: m.membershipId, firstName: m.displayName })),
    [budget.data],
  );

  // First proposal from the workbook; the person's changes then live in `edited` (FR-040).
  const initial = useMemo<SheetState[] | null>(() => {
    if (!workbook || !budget.data) return null;
    return workbook.sheets.map((s) => {
      const sheet = proposeSheetMapping(s.name, s.grid, members);
      const empty = Object.keys(sheet.memberColumns).length === 0 || sheet.rows.length + sheet.incomes.length === 0;
      return {
        sheet,
        periodStart: sheet.period ? periodStartFor(sheet.period, startDay) : null,
        skipped: empty,
        edits: {},
      };
    });
  }, [workbook, budget.data, members, startDay]);
  const [edited, setStates] = useState<SheetState[] | null>(null);
  const states = edited ?? initial;

  // Debounced dry run after each change (FR-042); months that already exist are skipped once.
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [checking, setChecking] = useState(false);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const conflictSeen = useRef(new Set<string>());
  useEffect(() => {
    if (!states || !categories.data) return;
    const request = buildImportRequest(states, categories.data.categories, currency);
    if (request.months.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setChecking(true);
      planningApi
        .importPreview(budgetId, request)
        .then((result) => {
          if (cancelled) return;
          setPreviewError(null);
          setPreviews((old) => ({ ...old, ...Object.fromEntries(result.months.map((m) => [m.periodStart, m])) }));
          const fresh = result.months.filter((m) => m.conflict === 'exists' && !conflictSeen.current.has(m.periodStart));
          if (fresh.length > 0) {
            fresh.forEach((m) => conflictSeen.current.add(m.periodStart));
            const starts = new Set(fresh.map((m) => m.periodStart));
            setStates((all) => (all ?? states).map((s) => (s.periodStart && starts.has(s.periodStart) ? { ...s, skipped: true } : s)));
          }
        })
        .catch((e: unknown) => !cancelled && setPreviewError(e))
        .finally(() => !cancelled && setChecking(false));
    }, DRY_RUN_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [states, categories.data, budgetId, currency]);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<unknown>(null);
  const blocker = states ? importBlocker(states, currency) : 'nothing';
  const hasConflict =
    !!states && states.some((s) => !s.skipped && s.periodStart && previews[s.periodStart]?.conflict === 'exists');
  const included = states?.filter((s) => !s.skipped).length ?? 0;

  const update = (index: number, change: (s: SheetState) => SheetState) =>
    setStates((all) => (all ?? states ?? []).map((s, i) => (i === index ? change(s) : s)));

  const commit = async () => {
    if (!states || !categories.data) return;
    setCommitError(null);
    setCommitting(true);
    try {
      await planningApi.importCommit(budgetId, buildImportRequest(states, categories.data.categories, currency));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      importStore.clear();
      await client.invalidateQueries({ queryKey: planningKeys.all(budgetId) });
      router.dismissTo(`/budgets/${budgetId}/months` as Href);
    } catch (e) {
      setCommitError(e);
    } finally {
      setCommitting(false);
    }
  };

  const cancel = () => {
    importStore.clear();
    router.back();
  };

  if (!workbook) {
    return (
      <FormScreen>
        <Stack.Screen options={{ title: t('planning.import.previewTitle') }} />
        <ThemedText>{t('planning.import.noWorkbook')}</ThemedText>
        <Button variant="secondary" label={t('planning.import.close')} onPress={() => router.back()} />
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('planning.import.previewTitle') }} />
      <ThemedText type="small" themeColor="textSecondary">
        {workbook.fileName}
      </ThemedText>
      <ErrorBanner message={budget.error ? errorMessage(t, budget.error) : null} />
      {states?.map((state, index) => (
        <SheetCard
          key={`${state.sheet.sheetName}-${index}`}
          state={state}
          preview={state.periodStart ? previews[state.periodStart] : undefined}
          currency={currency}
          startDay={startDay}
          fallbackStart={budget.data?.currentMonth.start ?? null}
          members={members}
          onChange={(change) => update(index, change)}
        />
      ))}
      {checking ? (
        <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
          {t('planning.import.checking')}
        </ThemedText>
      ) : null}
      <ErrorBanner message={previewError ? errorMessage(t, previewError) : null} />
      <ErrorBanner message={commitError ? errorMessage(t, commitError) : null} />
      {blocker ? (
        <IconLabel icon="alert" label={t(`planning.import.blocked_${blocker}`)} />
      ) : hasConflict ? (
        <IconLabel icon="alert" label={t('planning.import.exists')} />
      ) : null}
      <Button
        label={t('planning.import.confirm', { count: included })}
        loading={committing}
        disabled={!!blocker || hasConflict || !categories.data || checking}
        onPress={() => void commit()}
      />
      <Button variant="secondary" label={t('planning.import.cancel')} onPress={cancel} />
    </FormScreen>
  );
}

function SheetCard({
  state,
  preview,
  currency,
  startDay,
  fallbackStart,
  members,
  onChange,
}: {
  state: SheetState;
  preview: Preview | undefined;
  currency: string;
  startDay: number;
  fallbackStart: string | null;
  members: { membershipId: string; firstName: string }[];
  onChange: (change: (s: SheetState) => SheetState) => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { sheet } = state;
  const [open, setOpen] = useState<number | null>(null);
  const rules = [{ effectiveFrom: '1900-01-01', startDay }];
  const title = state.periodStart ? monthTitle(budgetMonthFor(state.periodStart, rules), i18n.language) : null;
  const shift = (by: number) => {
    const from = state.periodStart ?? fallbackStart;
    if (!from) return;
    onChange((s) => ({ ...s, periodStart: shiftPeriod(from, startDay, s.periodStart ? by : 0) }));
  };
  const name = (id: string) => members.find((m) => m.membershipId === id)?.firstName ?? '';
  const blocking = new Set(blockingRows(state, currency).map((r) => r.rowIndex));
  const memberIds = Object.keys(sheet.memberColumns);

  return (
    <Card accessibilityLabel={t('planning.import.sheet', { name: sheet.sheetName })}>
      <ThemedText style={styles.title}>{t('planning.import.sheet', { name: sheet.sheetName })}</ThemedText>

      <View style={styles.row}>
        <StepButton icon="arrowL" label={t('planning.import.prevMonth')} onPress={() => shift(-1)} />
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('planning.import.period')}
          </ThemedText>
          <ThemedText type="smallBold">{title ?? t('planning.import.noPeriod')}</ThemedText>
        </View>
        <StepButton icon="chevR" label={t('planning.import.nextMonth')} onPress={() => shift(1)} />
      </View>

      <View style={styles.row}>
        <ThemedText type="smallBold" style={styles.flex}>
          {t('planning.import.skipSheet')}
        </ThemedText>
        <Switch
          accessibilityLabel={t('planning.import.skipSheet')}
          value={state.skipped}
          onValueChange={(skipped) => onChange((s) => ({ ...s, skipped }))}
          trackColor={{ true: theme.primary, false: theme.track }}
        />
      </View>

      {memberIds.length === 0 ? <IconLabel icon="alert" label={t('planning.import.noMembers')} /> : null}
      {preview?.conflict === 'exists' ? <IconLabel icon="alert" label={t('planning.import.exists')} /> : null}

      {!state.skipped && memberIds.length > 0 ? (
        <>
          {preview ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t(`planning.import.status_${preview.status}`)}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {t('planning.import.incomes', { count: sheet.incomes.length })}
          </ThemedText>

          <ThemedText type="smallBold">{t('planning.import.compare')}</ThemedText>
          {memberIds.map((id) => {
            const fromSheet = sheet.sheetTotals.whatsLeft[id];
            const fromApp = preview?.summary.members.find((m) => m.membershipId === id)?.whatsLeftMinor;
            const diff = fromSheet != null && fromApp != null ? BigInt(fromApp) - fromSheet : null;
            return (
              <View key={id} style={styles.compare}>
                <ThemedText type="smallBold">{name(id)}</ThemedText>
                <ThemedText type="small">
                  {fromSheet != null
                    ? t('planning.import.sheetValue', { amount: formatMinor(fromSheet.toString(), currency, i18n.language) })
                    : t('planning.import.sheetMissing')}
                </ThemedText>
                {fromApp != null ? (
                  <ThemedText type="small">
                    {t('planning.import.appValue', { amount: formatMinor(fromApp, currency, i18n.language) })}
                  </ThemedText>
                ) : null}
                {diff !== null && diff !== 0n ? (
                  <IconLabel
                    icon="alert"
                    label={t('planning.import.difference', {
                      amount: formatMinor(diff.toString(), currency, i18n.language),
                    })}
                  />
                ) : diff === 0n ? (
                  <IconLabel icon="check" label={t('planning.import.same')} />
                ) : null}
              </View>
            );
          })}
          {preview?.issues.map((issue) => (
            <IconLabel
              key={`${issue.lineIndex}-${issue.code}`}
              icon="alert"
              label={t('planning.import.serverIssue', {
                index: issue.lineIndex + 1,
                error: t(`errors.${issue.code}`, { defaultValue: issue.code }),
              })}
            />
          ))}

          <ThemedText type="smallBold">{t('planning.import.rows')}</ThemedText>
          {sheet.rows.map((row) => (
            <RowItem
              key={row.rowIndex}
              row={row}
              edit={state.edits[row.rowIndex]}
              blocking={blocking.has(row.rowIndex)}
              open={open === row.rowIndex}
              onToggle={() => setOpen(open === row.rowIndex ? null : row.rowIndex)}
              currency={currency}
              memberIds={memberIds}
              name={name}
              onEdit={(edit) =>
                onChange((s) => ({
                  ...s,
                  edits: { ...s.edits, [row.rowIndex]: { ...s.edits[row.rowIndex], ...edit } },
                }))
              }
            />
          ))}
        </>
      ) : null}
    </Card>
  );
}

function StepButton({ icon, label, onPress }: { icon: 'arrowL' | 'chevR'; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.step, { opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={20} themeColor="text" />
    </Pressable>
  );
}

function RowItem({
  row: proposed,
  edit,
  blocking,
  open,
  onToggle,
  currency,
  memberIds,
  name,
  onEdit,
}: {
  row: ProposedRow;
  edit: RowEdit | undefined;
  blocking: boolean;
  open: boolean;
  onToggle: () => void;
  currency: string;
  memberIds: string[];
  name: (id: string) => string;
  onEdit: (edit: RowEdit) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const row = effectiveRow(proposed, edit, currency);
  const skipped = edit?.skipped === true;
  const group = row.group ? t(`planning.groupsShort.${row.group}`) : t('planning.import.issue_unknown_group');
  const texts =
    edit?.amountTexts ??
    Object.fromEntries(
      memberIds.map((id) => {
        const v = proposed.amounts[id];
        return [id, v == null ? '' : formatPlain(v)];
      }),
    );
  const summary = [
    row.label,
    group,
    t(`planning.kinds.${row.kind}`),
    skipped ? t('planning.import.skippedRow') : null,
    blocking ? t('planning.import.rowIssue') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={[styles.item, { borderColor: blocking ? theme.danger : theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityHint={t('planning.import.edit')}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.itemHead, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={styles.flex} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <ThemedText type="smallBold" style={skipped ? styles.skipped : undefined}>
            {row.label}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {[group, t(`planning.kinds.${row.kind}`), row.categoryKey ? t(`planning.categories.${row.categoryKey}`) : null]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
          {memberIds.map((id) =>
            row.amounts[id] != null ? (
              <View key={id} style={styles.amountRow}>
                <ThemedText type="small" style={styles.flex}>
                  {name(id)}
                </ThemedText>
                <Amount minor={row.amounts[id]!.toString()} currency={currency} type="small" />
              </View>
            ) : null,
          )}
          {skipped ? <IconLabel icon="x" label={t('planning.import.skippedRow')} /> : null}
          {!skipped && row.issues.includes('unreadable_amount') ? (
            <IconLabel icon="alert" label={t('planning.import.issue_unreadable_amount')} />
          ) : null}
          {!skipped && row.issues.includes('unknown_group') ? (
            <IconLabel icon="alert" label={t('planning.import.issue_unknown_group')} />
          ) : null}
        </View>
        <Icon name={open ? 'chevU' : 'chevD'} size={16} themeColor="textSecondary" />
      </Pressable>

      {open ? (
        <View style={styles.editor}>
          <View style={styles.row}>
            <ThemedText type="smallBold" style={styles.flex}>
              {t('planning.import.skipRow')}
            </ThemedText>
            <Switch
              accessibilityLabel={t('planning.import.skipRow')}
              value={skipped}
              onValueChange={(value) => onEdit({ skipped: value })}
              trackColor={{ true: theme.primary, false: theme.track }}
            />
          </View>
          <ThemedText type="smallBold">{t('planning.import.group')}</ThemedText>
          {GROUPS.map((g) => (
            <ChoiceRow
              key={g}
              label={t(`planning.groups.${g}`)}
              selected={row.group === g}
              onPress={() => onEdit({ group: g })}
            />
          ))}
          <ThemedText type="smallBold">{t('planning.import.kind')}</ThemedText>
          {KINDS.map((k) => (
            <ChoiceRow key={k} label={t(`planning.kinds.${k}`)} selected={row.kind === k} onPress={() => onEdit({ kind: k })} />
          ))}
          <ThemedText type="smallBold">{t('planning.import.category')}</ThemedText>
          <ChoiceRow
            label={t('planning.import.noCategory')}
            selected={row.categoryKey === null}
            onPress={() => onEdit({ categoryKey: null })}
          />
          {CATEGORY_SYSTEM_KEYS.map((key) => (
            <ChoiceRow
              key={key}
              label={t(`planning.categories.${key}`)}
              selected={row.categoryKey === key}
              onPress={() => onEdit({ categoryKey: key })}
            />
          ))}
          {memberIds.map((id) => (
            <AmountField
              key={id}
              label={name(id)}
              currency={currency}
              value={texts[id] ?? ''}
              onChange={(text) => onEdit({ amountTexts: { ...texts, [id]: text } })}
            />
          ))}
          <Button variant="link" label={t('planning.import.close')} onPress={onToggle} />
        </View>
      ) : null}
    </View>
  );
}

/** 1250n → "12,50": the editable text of an amount read from the sheet. */
function formatPlain(minor: bigint): string {
  const s = minor.toString().padStart(3, '0');
  return `${s.slice(0, -2)},${s.slice(-2)}`;
}

const styles = StyleSheet.create({
  title: { fontSize: 16, lineHeight: 22, fontFamily: FontFamily.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchTarget },
  flex: { flex: 1 },
  step: { width: MinTouchTarget, height: MinTouchTarget, alignItems: 'center', justifyContent: 'center' },
  compare: { gap: Spacing.one },
  item: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, padding: Spacing.two, gap: Spacing.two },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchTarget },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  editor: { gap: Spacing.two },
  skipped: { textDecorationLine: 'line-through' },
});
