import { useQuery } from '@tanstack/react-query';
import type { Category, Group, Kind, LineView, MonthDetail, SplitMode, UpdateLineRequest } from '@two-cents/shared/contracts';
import { computeShares, needsScope } from '@two-cents/shared/domain';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Amount } from '@/components/amount';
import { Button, ErrorBanner, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { ChoiceRow } from '@/features/budgets/components';
import { formatMinor } from '@/features/budgets/format';
import { AmountField, readAmount } from '@/features/planning/amount-field';
import { planningApi } from '@/features/planning/api';
import { askConflict, staleCurrent } from '@/features/planning/conflict-dialog';
import { FormulaInput, type FormulaValue, readFormula } from '@/features/planning/formula-input';
import { OverrunBadge } from '@/features/planning/overrun-badge';
import { planningKeys } from '@/features/planning/query-keys';
import { askScope } from '@/features/planning/scope-sheet';
import { countedIncomes, SplitPicker } from '@/features/planning/split-picker';
import { SubItemsEditor, type SubItemInputValue, subItemsBalance } from '@/features/planning/sub-items-editor';
import { type LineDraft, liveSummary } from '@/features/planning/use-live-summary';
import { useMonth, useMonthMutation } from '@/features/planning/use-month';
import { OfflineBanner } from '@/features/planning/offline-banner';

const GROUPS: Group[] = ['personal', 'recurring_shared', 'one_off_shared'];
const KINDS: Kind[] = ['expense', 'savings'];

/** Minor units to the text an amount field shows: "1250" → "12,50". */
function toInput(minor: string, language: string): string {
  const negative = minor.startsWith('-');
  const digits = minor.replace('-', '').padStart(3, '0');
  const text = `${digits.slice(0, -2)}${language === 'en' ? '.' : ','}${digits.slice(-2)}`;
  return negative ? `-${text}` : text;
}

/**
 * Add or edit a budget line (US1, US3, US4; FR-012 to FR-023). Personal lines take one amount and may
 * be private; shared lines are split by custom amounts (checked against a typed total, FR-020), equal
 * parts, income or one payer. Amounts may be periodic (FR-023), the line an envelope with
 * sub-items (FR-015). The summary underneath shows what each member would have left (FR-031).
 */
export default function LineSheet() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    budgetId: string;
    monthStart: string;
    lineId?: string;
    group?: Group;
    owner?: string;
  }>();
  const { budgetId, monthStart } = params;
  const month = useMonth(budgetId, monthStart);
  const data = month.data;
  const existing = data?.lines.find((l) => l.id === params.lineId);
  if (!data) return <FormScreen>{null}</FormScreen>;
  if (params.lineId && !existing) {
    return (
      <FormScreen>
        <ErrorBanner message={t('errors.NOT_FOUND')} />
      </FormScreen>
    );
  }
  return (
    <LineForm
      key={existing?.id ?? 'new'}
      budgetId={budgetId}
      monthStart={monthStart}
      detail={data}
      existing={existing}
      initialGroup={params.group}
    />
  );
}

function LineForm({
  budgetId,
  monthStart,
  detail,
  existing: line,
  initialGroup,
}: {
  budgetId: string;
  monthStart: string;
  detail: MonthDetail;
  existing?: LineView;
  initialGroup?: Group;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const me = detail.members.find((m) => m.isMe);
  const currency = detail.currency;
  const money = (minor: string) => formatMinor(minor, currency, i18n.language);
  const categories = useQuery({
    queryKey: planningKeys.categories(budgetId),
    queryFn: () => planningApi.categories(budgetId),
  });
  const [label, setLabel] = useState(line?.label ?? '');
  const [kind, setKind] = useState<Kind>(line?.kind ?? 'expense');
  const [group, setGroup] = useState<Group>(line?.group ?? initialGroup ?? 'recurring_shared');
  const [mode, setMode] = useState<SplitMode>(line?.splitMode ?? 'custom');
  const [payer, setPayer] = useState<string | null>(line?.payerMembershipId ?? null);
  const [amountInput, setAmountInput] = useState<FormulaValue>(() =>
    line?.formula
      ? { frequency: line.formula.kind, base: toInput(line.formula.baseMinor, i18n.language), factor: String(line.formula.factor) }
      : {
          frequency: 'monthly',
          base: line && (line.group === 'personal' || line.splitMode !== 'custom') ? toInput(line.totalMinor, i18n.language) : '',
          factor: '2',
        },
  );
  const [total, setTotal] = useState(
    line && line.group !== 'personal' && line.splitMode === 'custom' ? toInput(line.totalMinor, i18n.language) : '',
  );
  const [shares, setShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      detail.members.map((m) => {
        const s = line?.shares.find((x) => x.membershipId === m.membershipId);
        return [m.membershipId, s && line?.group !== 'personal' ? toInput(s.amountMinor, i18n.language) : ''];
      }),
    ),
  );
  const [categoryId, setCategoryId] = useState<string | null>(line?.categoryId ?? null);
  const [isEnvelope, setIsEnvelope] = useState(line?.isEnvelope ?? false);
  const [subItems, setSubItems] = useState<SubItemInputValue[]>(
    () =>
      line?.subItems.map((s) => ({
        key: s.id,
        label: s.label,
        amount: s.amountMinor ? toInput(s.amountMinor, i18n.language) : '',
      })) ?? [],
  );
  const [isPrivate, setIsPrivate] = useState(line?.isPrivate ?? false);
  const [error, setError] = useState<unknown>(null);

  const personal = group === 'personal';
  const custom = !personal && mode === 'custom';
  const formulaRead = readFormula(amountInput, currency);
  const totalRead = readAmount(total, currency);
  const shareReads = detail.members.map((m) => ({ id: m.membershipId, ...readAmount(shares[m.membershipId] ?? '', currency) }));
  const sharesValid = shareReads.every((s) => !s.error) && shareReads.some((s) => s.minor !== null);
  const sharesSum = shareReads.reduce((sum, s) => sum + BigInt(s.minor ?? '0'), 0n);
  const difference = custom && sharesValid && totalRead.minor !== null ? BigInt(totalRead.minor) - sharesSum : 0n;

  // The line's amounts as the API will compute them (FR-017, FR-023), for the live summary.
  const computed = ((): { totalMinor: string; shares: { membershipId: string; amountMinor: string }[] } | null => {
    if (!me) return null;
    if (personal)
      return formulaRead
        ? { totalMinor: formulaRead.totalMinor, shares: [{ membershipId: me.membershipId, amountMinor: formulaRead.totalMinor }] }
        : null;
    if (custom)
      return sharesValid && !totalRead.error && difference === 0n
        ? {
            totalMinor: sharesSum.toString(),
            shares: shareReads.map((s) => ({ membershipId: s.id, amountMinor: s.minor ?? '0' })),
          }
        : null;
    if (!formulaRead) return null;
    try {
      const result = computeShares({
        mode,
        total: BigInt(formulaRead.totalMinor),
        payerMembershipId: payer ?? undefined,
        members: detail.members.map((m) => ({ membershipId: m.membershipId, order: m.order })),
        incomes: countedIncomes(detail),
      });
      return {
        totalMinor: result.total.toString(),
        shares: Object.entries(result.shares).map(([membershipId, v]) => ({ membershipId, amountMinor: v.toString() })),
      };
    } catch {
      return null;
    }
  })();
  const subBalance = isEnvelope ? subItemsBalance(subItems, computed?.totalMinor ?? null, currency) : 0n;
  const subItemsOk =
    !isEnvelope ||
    (subItems.every((s) => s.label.trim().length > 0 && !readAmount(s.amount, currency).error) &&
      (subBalance === null || subBalance >= 0n));
  const labelOk = label.trim().length > 0 && [...label.trim()].length <= 60;
  const valid = labelOk && computed !== null && subItemsOk && !!me;

  const draft: LineDraft | null = computed ? { id: line?.id, group, kind, shares: computed.shares } : null;
  const preview = draft ? liveSummary(detail, { line: draft }) : detail.summary;

  const formulaKey = (f: { kind: string; baseMinor: string; factor: number } | null | undefined) =>
    f ? `${f.kind}:${f.baseMinor}:${f.factor}` : '';
  const amountsChanged = (): boolean => {
    if (!line || !computed) return true;
    if (group !== line.group) return true;
    if (!personal && (mode !== line.splitMode || (mode === 'one_payer' && payer !== line.payerMembershipId))) return true;
    if (!custom && formulaKey(formulaRead?.formula) !== formulaKey(line.formula)) return true;
    if (computed.totalMinor !== line.totalMinor) return true;
    const before = Object.fromEntries(line.shares.map((s) => [s.membershipId, s.amountMinor]));
    return custom && computed.shares.some((s) => (before[s.membershipId] ?? '0') !== s.amountMinor);
  };

  const amountBody = () =>
    custom
      ? {
          entry: 'shares' as const,
          shares: shareReads.map((s) => ({ membershipId: s.id, amountMinor: s.minor ?? '0' })),
          ...(totalRead.minor !== null ? { totalMinor: totalRead.minor } : {}),
        }
      : formulaRead!.formula
        ? { entry: 'total' as const, formula: formulaRead!.formula }
        : { entry: 'total' as const, totalMinor: formulaRead!.totalMinor };
  const splitBody = () =>
    personal ? {} : { split: { mode, ...(mode === 'one_payer' && payer ? { payerMembershipId: payer } : {}) } };
  const subItemsBody = () =>
    isEnvelope
      ? subItems.map((s) => {
          const amount = readAmount(s.amount, currency).minor;
          return { label: s.label.trim(), ...(amount !== null ? { amountMinor: amount } : {}) };
        })
      : [];

  const save = useMonthMutation(budgetId, monthStart, async (vars: { version?: number; scope?: UpdateLineRequest['scope'] }) => {
    if (!line)
      return planningApi.createLine(budgetId, monthStart, {
        group,
        kind,
        label: label.trim(),
        categoryId,
        isEnvelope,
        subItems: subItemsBody(),
        ...(personal ? { ownerMembershipId: me!.membershipId, isPrivate } : {}),
        ...splitBody(),
        amount: amountBody(),
      });
    return planningApi.updateLine(budgetId, monthStart, line.id, {
      expectedVersion: vars.version ?? line.version,
      label: label.trim(),
      kind,
      categoryId,
      isEnvelope,
      subItems: subItemsBody(),
      ...(personal ? { isPrivate } : {}),
      ...(group !== line.group ? { group, ...(personal ? { ownerMembershipId: me!.membershipId } : {}) } : {}),
      ...(amountsChanged() ? { amount: amountBody(), ...splitBody() } : {}),
      ...(vars.scope ? { scope: vars.scope } : {}),
    });
  });

  async function submit(version?: number) {
    setError(null);
    let scope: UpdateLineRequest['scope'];
    if (line && line.group === group && amountsChanged() && needsScope(line.group, ['totalMinor'])) {
      const choice = await askScope(t);
      if (!choice) return;
      scope = choice;
    }
    save.mutate(
      { version, scope },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
        onError: async (e) => {
          const current = staleCurrent<LineView>(e);
          if (!current) return setError(e);
          const choice = await askConflict(t, {
            theirs: `${current.label} — ${money(current.totalMinor)}`,
            mine: `${label.trim()} — ${money(computed?.totalMinor ?? '0')}`,
          });
          if (choice === 'mine') void submit(current.version);
          else router.back();
        },
      },
    );
  }

  const remove = useMonthMutation(budgetId, monthStart, () =>
    planningApi.deleteLine(budgetId, monthStart, line!.id, line!.version),
  );
  function confirmDelete() {
    Alert.alert(t('planning.line.deleteConfirmTitle', { label: line!.label }), t('planning.line.deleteConfirmBody'), [
      { text: t('planning.line.cancel'), style: 'cancel' },
      {
        text: t('planning.line.delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(undefined, {
            onSuccess: () => {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            },
            onError: setError,
          }),
      },
    ]);
  }

  const name = (id: string) =>
    detail.members.find((m) => m.membershipId === id)?.displayName ?? t('budgets.anonymousFormerMember');
  const categoryName = (c: Category) =>
    c.name ?? (c.systemKey ? t(`planning.categories.${c.systemKey}`) : '');

  return (
    <FormScreen title={t(line ? 'planning.line.editTitle' : 'planning.line.newTitle')}>
      <Stack.Screen options={{ title: t(line ? 'planning.line.editTitle' : 'planning.line.newTitle') }} />
      <OfflineBanner />
      <TextField label={t('planning.line.label')} value={label} onChangeText={setLabel} maxLength={60} autoFocus={!line} />

      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('planning.line.group')}>
        <ThemedText type="smallBold">{t('planning.line.group')}</ThemedText>
        {GROUPS.map((g) => (
          <ChoiceRow key={g} label={t(`planning.groups.${g}`)} selected={group === g} onPress={() => setGroup(g)} />
        ))}
      </View>
      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('planning.line.kind')}>
        <ThemedText type="smallBold">{t('planning.line.kind')}</ThemedText>
        {KINDS.map((k) => (
          <ChoiceRow key={k} label={t(`planning.kinds.${k}`)} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>

      {!personal ? (
        <SplitPicker
          detail={detail}
          mode={mode}
          payer={payer}
          onChange={(m, p) => {
            setMode(m);
            setPayer(p);
          }}
        />
      ) : null}

      {custom ? (
        <>
          {detail.members.map((m) => (
            <AmountField
              key={m.membershipId}
              label={t('planning.line.share', { name: name(m.membershipId), currency })}
              currency={currency}
              value={shares[m.membershipId] ?? ''}
              onChange={(text) => setShares((s) => ({ ...s, [m.membershipId]: text }))}
            />
          ))}
          <AmountField
            label={t('planning.line.totalOptional', { currency })}
            currency={currency}
            value={total}
            onChange={setTotal}
          />
          {sharesValid ? (
            <ThemedText accessibilityLiveRegion="polite" type="smallBold">
              {difference > 0n
                ? t('planning.line.missing', { amount: money(difference.toString()) })
                : difference < 0n
                  ? t('planning.line.excess', { amount: money((-difference).toString()) })
                  : t('planning.line.computedTotal', { amount: money(sharesSum.toString()) })}
            </ThemedText>
          ) : null}
        </>
      ) : (
        <>
          <FormulaInput
            label={t('planning.line.total', { currency })}
            currency={currency}
            value={amountInput}
            onChange={setAmountInput}
          />
          {!personal && computed ? (
            <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
              {computed.shares.map((s) => `${name(s.membershipId)} ${money(s.amountMinor)}`).join(' · ')}
            </ThemedText>
          ) : null}
        </>
      )}

      {personal ? (
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <ThemedText type="smallBold">{t('planning.privacy.label')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('planning.privacy.hint')}
            </ThemedText>
          </View>
          <Switch
            accessibilityLabel={t('planning.privacy.label')}
            accessibilityHint={t('planning.privacy.hint')}
            value={isPrivate}
            onValueChange={setIsPrivate}
          />
        </View>
      ) : null}

      {categories.data ? (
        <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('planning.lineCategory')}>
          <ThemedText type="smallBold">{t('planning.lineCategory')}</ThemedText>
          <ChoiceRow
            label={t('planning.categoriesScreen.none')}
            selected={categoryId === null}
            onPress={() => setCategoryId(null)}
          />
          {categories.data.categories.map((c) => (
            <ChoiceRow key={c.id} label={categoryName(c)} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </View>
      ) : null}

      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{t('planning.envelope.label')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('planning.envelope.hint')}
          </ThemedText>
        </View>
        <Switch
          accessibilityLabel={t('planning.envelope.label')}
          accessibilityHint={t('planning.envelope.hint')}
          value={isEnvelope}
          onValueChange={setIsEnvelope}
        />
      </View>
      {isEnvelope ? (
        <SubItemsEditor items={subItems} onChange={setSubItems} totalMinor={computed?.totalMinor ?? null} currency={currency} />
      ) : null}

      <Card accessibilityLabel={t('planning.line.liveTitle')}>
        <ThemedText type="smallBold">{t('planning.line.liveTitle')}</ThemedText>
        {preview.members.map((s) => (
          <View key={s.membershipId} style={styles.preview} accessible>
            <ThemedText style={styles.flex}>{name(s.membershipId)}</ThemedText>
            {s.overrun ? <OverrunBadge /> : null}
            <Amount minor={s.whatsLeftMinor} currency={currency} type="smallBold" />
          </View>
        ))}
      </Card>

      <ErrorBanner message={error ? errorMessage(t, error) : null} />
      <Button label={t('planning.line.save')} disabled={!valid} loading={save.isPending} onPress={() => void submit()} />
      {line ? (
        <Button label={t('planning.line.delete')} variant="danger" loading={remove.isPending} onPress={confirmDelete} />
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchTarget },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchTarget },
  flex: { flex: 1 },
});
