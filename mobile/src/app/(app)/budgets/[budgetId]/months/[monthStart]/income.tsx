import type { IncomeLineView, MonthDetail } from '@two-cents/shared/contracts';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Amount } from '@/components/amount';
import { Button, ErrorBanner, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card, SectionHeader } from '@/components/ui';
import { FontFamily, MinTouchTarget, Spacing } from '@/constants/theme';
import { formatMinor } from '@/features/budgets/format';
import { AmountField, readAmount } from '@/features/planning/amount-field';
import { planningApi } from '@/features/planning/api';
import { askConflict, staleCurrent } from '@/features/planning/conflict-dialog';
import { useMonth, useMonthMutation } from '@/features/planning/use-month';
import { OfflineBanner } from '@/features/planning/offline-banner';
import { useTheme } from '@/hooks/use-theme';

function toInput(minor: string, language: string): string {
  const digits = minor.padStart(3, '0');
  return `${digits.slice(0, -2)}${language === 'en' ? '.' : ','}${digits.slice(-2)}`;
}

/**
 * The month's incomes (US1, FR-009, FR-010): the caller edits their own lines (salary, meal vouchers,
 * bonus…) and whether each counts toward the household; everyone else's are shown read-only.
 */
export default function IncomeScreen() {
  const { t } = useTranslation();
  const { budgetId, monthStart } = useLocalSearchParams<{ budgetId: string; monthStart: string }>();
  const month = useMonth(budgetId, monthStart);
  const data = month.data;
  if (!data) return <FormScreen>{null}</FormScreen>;

  const me = data.members.find((m) => m.isMe);
  const mine = data.incomes.filter((i) => i.membershipId === me?.membershipId);
  // Contributing members only; nothing is writable in a closed month (FR-036).
  const canWrite = !!me && data.can.editShared;
  const others = data.members.filter((m) => !m.isMe);
  const toConfirm = canWrite && mine.some((i) => i.toConfirm);

  return (
    <FormScreen title={t('planning.income.title')}>
      <OfflineBanner />
      <Stack.Screen options={{ title: t('planning.income.title') }} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('planning.income.visibility')}
      </ThemedText>

      {toConfirm ? <ConfirmIncomes budgetId={budgetId} monthStart={monthStart} /> : null}

      {me ? (
        <>
          <SectionHeader title={t('planning.income.mine')} />
          {mine.map((income) => (
            <IncomeEditor
              key={income.id}
              budgetId={budgetId}
              monthStart={monthStart}
              detail={data}
              income={income}
            />
          ))}
          {canWrite ? <IncomeEditor budgetId={budgetId} monthStart={monthStart} detail={data} /> : null}
        </>
      ) : null}

      {others.map((m) => {
        const theirs = data.incomes.filter((i) => i.membershipId === m.membershipId);
        return (
          <View key={m.membershipId} style={styles.section}>
            <SectionHeader title={t('planning.income.others', { name: m.displayName ?? t('budgets.anonymousFormerMember') })} />
            <Card style={styles.list}>
              {theirs.map((i) => (
                <View key={i.id} accessible style={styles.row}>
                  <View style={styles.flex}>
                    <ThemedText style={styles.rowTitle}>{i.label ?? t('planning.defaultIncome')}</ThemedText>
                    {!i.countsTowardHousehold ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {t('planning.notCounted')}
                      </ThemedText>
                    ) : null}
                  </View>
                  <Amount minor={i.amountMinor} currency={data.currency} style={styles.rowTitle} />
                </View>
              ))}
            </Card>
          </View>
        );
      })}
    </FormScreen>
  );
}

/** US2 (FR-006): one tap confirms every income pre-filled from the previous month. */
function ConfirmIncomes({ budgetId, monthStart }: { budgetId: string; monthStart: string }) {
  const { t } = useTranslation();
  const confirm = useMonthMutation(budgetId, monthStart, () => planningApi.confirmIncomes(budgetId, monthStart));
  return (
    <Card accessibilityLabel={t('planning.month.confirmIncomesBanner')}>
      <ThemedText type="smallBold">{t('planning.month.confirmIncomesBanner')}</ThemedText>
      <ErrorBanner message={confirm.error ? errorMessage(t, confirm.error) : null} />
      <Button
        label={t('planning.month.confirmIncomes')}
        loading={confirm.isPending}
        onPress={() =>
          confirm.mutate(undefined, {
            onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
          })
        }
      />
    </Card>
  );
}

/** One of my incomes, or a new one when `income` is absent. */
function IncomeEditor({
  budgetId,
  monthStart,
  detail,
  income,
}: {
  budgetId: string;
  monthStart: string;
  detail: MonthDetail;
  income?: IncomeLineView;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const currency = detail.currency;
  const [label, setLabel] = useState(income?.label ?? '');
  const [amount, setAmount] = useState(income ? toInput(income.amountMinor, i18n.language) : '');
  const [counts, setCounts] = useState(income?.countsTowardHousehold ?? true);
  const [error, setError] = useState<unknown>(null);
  const read = readAmount(amount, currency);
  const editable = income ? income.editable : true;
  const changed =
    !income ||
    income.amountMinor !== read.minor ||
    (income.label ?? '') !== label.trim() ||
    income.countsTowardHousehold !== counts ||
    income.toConfirm;

  const save = useMonthMutation(budgetId, monthStart, (version?: number) =>
    income
      ? planningApi.updateIncome(budgetId, monthStart, income.id, {
          expectedVersion: version ?? income.version,
          label: label.trim() ? label.trim() : null,
          amountMinor: read.minor!,
          countsTowardHousehold: counts,
        })
      : planningApi.createIncome(budgetId, monthStart, {
          ...(label.trim() ? { label: label.trim() } : {}),
          amountMinor: read.minor!,
          countsTowardHousehold: counts,
        }),
  );
  const remove = useMonthMutation(budgetId, monthStart, (version?: number) =>
    planningApi.deleteIncome(budgetId, monthStart, income!.id, version ?? income!.version),
  );

  const onError = (retry: (version: number) => void) => async (e: unknown) => {
    const current = staleCurrent<IncomeLineView>(e);
    if (!current) return setError(e);
    const choice = await askConflict(t, {
      theirs: formatMinor(current.amountMinor, currency, i18n.language),
      mine: read.minor ? formatMinor(read.minor, currency, i18n.language) : '—',
    });
    if (choice === 'mine') retry(current.version);
  };

  function submit(version?: number) {
    setError(null);
    save.mutate(version, {
      onSuccess: () => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (!income) {
          setLabel('');
          setAmount('');
          setCounts(true);
        }
      },
      onError: onError(submit),
    });
  }

  function del(version?: number) {
    setError(null);
    remove.mutate(version, {
      onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      onError: onError(del),
    });
  }

  return (
    <Card>
      {income?.toConfirm ? <ThemedText type="smallBold">{t('planning.income.toConfirm')}</ThemedText> : null}
      <TextField label={t('planning.income.label')} value={label} onChangeText={setLabel} maxLength={40} editable={editable} />
      <AmountField
        label={t('planning.income.amount', { currency })}
        currency={currency}
        value={amount}
        onChange={setAmount}
        editable={editable}
      />
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{t('planning.income.counts')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('planning.income.countsHint')}
          </ThemedText>
        </View>
        <Switch
          accessibilityLabel={t('planning.income.counts')}
          accessibilityHint={t('planning.income.countsHint')}
          value={counts}
          onValueChange={setCounts}
          disabled={!editable}
          trackColor={{ true: theme.primary, false: theme.track }}
        />
      </View>
      <ErrorBanner message={error ? errorMessage(t, error) : null} />
      {editable ? (
        <Button
          label={t(income ? 'planning.income.save' : 'planning.income.add')}
          disabled={read.minor === null || !changed}
          loading={save.isPending}
          onPress={() => submit()}
        />
      ) : null}
      {income && editable ? (
        <Button label={t('planning.income.delete')} variant="link" loading={remove.isPending} onPress={() => del()} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  list: { paddingVertical: Spacing.two, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchTarget, paddingVertical: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchTarget },
  flex: { flex: 1 },
  rowTitle: { fontSize: 15, lineHeight: 20, fontFamily: FontFamily.semibold },
});
