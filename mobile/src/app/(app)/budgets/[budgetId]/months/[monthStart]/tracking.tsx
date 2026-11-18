import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { type Href, router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet } from 'react-native';

import { errorMessage } from '@/auth/error-message';
import { FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card, ListRow, SectionHeader } from '@/components/ui';
import { formatMinor } from '@/features/budgets/format';
import { trackingApi } from '@/features/tracking/api';
import { newId } from '@/features/tracking/ids';
import { type PaidAsPlannedVars, runTrackingMutation } from '@/features/tracking/mutations';
import { trackingKeys } from '@/features/tracking/query-keys';
import { BalanceCard, EnvelopeCard, SyncBadge, TotalsSummary, TrackingRow, VoucherCard } from '@/features/tracking/tracking-cards';
import { SyncBanner } from '@/features/tracking/sync-banner';
import { useTracking } from '@/features/tracking/use-tracking';

const GROUPS = ['personal', 'recurring_shared', 'one_off_shared'] as const;

/**
 * Planned vs actual for one month (US2, US6, US7): envelopes first, then every line by group, the
 * "Privé" rows of other members, unassigned spending, who owes whom and meal vouchers.
 */
export default function TrackingScreen() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const { budgetId, monthStart } = useLocalSearchParams<{ budgetId: string; monthStart: string }>();
  const { data, month, pending } = useTracking(budgetId, monthStart);
  if (!data || !month) return <FormScreen>{null}</FormScreen>;

  const currency = month.currency;
  const labelOf = (lineId: string) => month.lines.find((l) => l.id === lineId)?.label ?? '';
  const nameOf = (id: string) => month.members.find((m) => m.membershipId === id)?.displayName ?? t('planning.history.someone');
  const canWrite = month.can.editShared;
  const writableLine = (lineId: string) => {
    const line = month.lines.find((l) => l.id === lineId);
    return canWrite && !!line && (line.group !== 'personal' || line.editable);
  };

  const paidAsPlanned = (lineId: string) => {
    void runTrackingMutation<PaidAsPlannedVars>(client, 'paidAsPlanned', { budgetId, monthStart, lineId, txnId: newId() })
      .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
      .catch((e: unknown) => Alert.alert(errorMessage(t, e)));
  };

  const settle = (b: (typeof data.balances)[number]) => {
    const amount = formatMinor(b.amountMinor, currency, i18n.language);
    Alert.alert(t('tracking.balance.markSettled'), t('tracking.balance.settleConfirm', { from: nameOf(b.from), to: nameOf(b.to), amount }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tracking.balance.markSettled'),
        onPress: () =>
          void trackingApi
            .settle(budgetId, monthStart, { fromMembershipId: b.from, toMembershipId: b.to, amountMinor: b.amountMinor })
            .then(() => {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              void client.invalidateQueries({ queryKey: trackingKeys.tracking(budgetId, monthStart) });
            })
            .catch((e: unknown) => Alert.alert(errorMessage(t, e))),
      },
    ]);
  };

  const envelopes = data.lines.filter((l) => l.envelope);
  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('tracking.screen.title') }} />
      <SyncBanner budgetId={budgetId} />
      {pending ? <SyncBadge /> : null}
      <Card>
        <TotalsSummary title={t('tracking.screen.month')} totals={data.month} currency={currency} />
      </Card>
      <ListRow
        icon="receipt"
        title={t('tracking.screen.seeTransactions')}
        onPress={() => router.push(`/budgets/${budgetId}/months/${monthStart}/transactions` as Href)}
      />

      {envelopes.length ? <SectionHeader title={t('tracking.screen.envelopes')} /> : null}
      {envelopes.map((l) => (
        <EnvelopeCard
          key={l.lineId}
          label={labelOf(l.lineId)}
          line={l}
          currency={currency}
          onPress={() => router.push(`/budgets/${budgetId}/months/${monthStart}/envelope/${l.lineId}` as Href)}
        />
      ))}

      <SectionHeader title={t('tracking.screen.plannedVsActual')} />
      {GROUPS.map((group) => {
        const totals = data.groups.find((g) => g.group === group)!.totals;
        const lines = data.lines.filter((l) => l.group === group);
        const privates = group === 'personal' ? data.privateAggregates : [];
        if (!lines.length && !privates.length) return null;
        return (
          <Card key={group}>
            <TotalsSummary title={t(`tracking.screen.groups.${group}`)} totals={totals} currency={currency} />
            {lines.map((l) => (
              <TrackingRow
                key={l.lineId}
                label={labelOf(l.lineId)}
                line={l}
                currency={currency}
                onPaidAsPlanned={l.actual === null && writableLine(l.lineId) ? () => paidAsPlanned(l.lineId) : undefined}
              />
            ))}
            {privates.map((p) => (
              <TrackingRow
                key={p.membershipId}
                label={`${t('tracking.private')} · ${nameOf(p.membershipId)}`}
                currency={currency}
                line={{ planned: p.plannedMinor, actual: p.actualMinor, difference: null, differencePermille: null }}
              />
            ))}
          </Card>
        );
      })}

      {data.unassigned.txnCount > 0 ? (
        <Card>
          <TrackingRow
            label={t('tracking.unassigned')}
            currency={currency}
            line={{ planned: '0', actual: data.unassigned.actual, difference: null, differencePermille: null }}
          />
          {data.unassigned.needsReviewCount > 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              {t('tracking.needsReview')} · {data.unassigned.needsReviewCount}
            </ThemedText>
          ) : null}
        </Card>
      ) : null}

      <BalanceCard balances={data.balances} nameOf={nameOf} currency={currency} onSettle={canWrite || data.status === 'closed' ? settle : undefined} />
      <VoucherCard vouchers={data.vouchers} nameOf={nameOf} currency={currency} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({ note: { marginTop: 4 } });
