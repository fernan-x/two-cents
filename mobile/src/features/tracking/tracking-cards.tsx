import type { LineTrackingView, TotalsView, TrackingView } from '@two-cents/shared/contracts';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Amount } from '@/components/amount';
import { Button } from '@/components/form';
import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Card, ProgressBar, type Tone } from '@/components/ui';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { formatMinor } from '@/features/budgets/format';
import { useTheme } from '@/hooks/use-theme';

/** 825 → "82,5 %". Integer thousandths only, no money involved. */
export function formatPermille(permille: number, language: string): string {
  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(permille / 1000);
}

/** A state shown by icon and text, never color alone (Principle VIII). */
export function StateBadge({ icon, tone, label }: { icon: IconName; tone: Tone; label: string }) {
  const theme = useTheme();
  const bg = tone === 'danger' ? theme.dangerBackground : tone === 'warning' ? theme.warningBackground : theme.tint;
  const fg = tone === 'danger' ? theme.danger : tone === 'warning' ? theme.warning : theme.primary;
  return (
    <View accessible accessibilityLabel={label} style={[styles.badge, { backgroundColor: bg }]}>
      <Icon name={icon} size={14} color={fg} />
      <ThemedText type="smallBold" style={tone === 'warning' ? { color: theme.warningText } : undefined}>
        {label}
      </ThemedText>
    </View>
  );
}

/** "En attente de synchro" on rows not yet confirmed by the server (US3). */
export function SyncBadge() {
  const { t } = useTranslation();
  return <StateBadge icon="clock" tone="primary" label={t('tracking.pending')} />;
}

/** One envelope (FR-026): spent / remaining, a progress bar, warning above 80 %, overrun above 100 %. */
export function EnvelopeCard({
  label,
  line,
  currency,
  onPress,
}: {
  label: string;
  line: LineTrackingView;
  currency: string;
  onPress?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const env = line.envelope!;
  const lang = i18n.language;
  const money = (m: string) => formatMinor(m, currency, lang);
  const tone: Tone = env.level === 'over' ? 'danger' : env.level === 'warning' ? 'warning' : 'success';
  const spentText = t('tracking.screen.spentOf', { spent: money(env.spent), planned: money(line.planned) });
  const percent = formatPermille(env.progressPermille, lang);
  const content = (
    <Card>
      <View style={styles.rowBetween}>
        <ThemedText type="smallBold" style={styles.flex}>
          {label}
        </ThemedText>
        {env.level === 'over' ? (
          <StateBadge icon="alert" tone="danger" label={t('tracking.overBy', { amount: money(env.over) })} />
        ) : env.level === 'warning' ? (
          <StateBadge icon="alert" tone="warning" label={t('tracking.warning', { percent })} />
        ) : null}
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(env.progressPermille / 10)), text: `${percent}, ${spentText}` }}>
        <ProgressBar value={env.progressPermille / 1000} tone={tone} height={8} />
      </View>
      <View style={styles.rowBetween}>
        <ThemedText type="small" themeColor="textSecondary">
          {spentText}
        </ThemedText>
        <ThemedText type="small">{t('tracking.screen.remaining', { amount: money(env.remaining) })}</ThemedText>
      </View>
    </Card>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${spentText}`} onPress={onPress} style={{ minHeight: MinTouchTarget }}>
      {content}
    </Pressable>
  );
}

/** Planned, actual and difference of one line; "Non suivi" + "Payé comme prévu" without transactions (FR-023, FR-025). */
export function TrackingRow({
  label,
  line,
  currency,
  onPaidAsPlanned,
  onPress,
}: {
  label: string;
  line: Pick<LineTrackingView, 'planned' | 'actual' | 'difference' | 'differencePermille'>;
  currency: string;
  onPaidAsPlanned?: () => void;
  onPress?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.trackRow, { borderBottomColor: theme.border }]}>
      <View style={styles.flex}>
        <ThemedText numberOfLines={2}>{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('tracking.screen.planned')} {formatMinor(line.planned, currency, i18n.language)}
        </ThemedText>
      </View>
      {line.actual === null ? (
        <View style={styles.end}>
          <StateBadge icon="clock" tone="primary" label={t('tracking.notTracked')} />
          {onPaidAsPlanned ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('tracking.paidAsPlanned')}, ${label}`}
              onPress={onPaidAsPlanned}
              style={styles.link}>
              <ThemedText type="linkPrimary">{t('tracking.paidAsPlanned')}</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.end}>
          <Amount minor={line.actual} currency={currency} type="smallBold" />
          {line.difference !== null && line.difference !== '0' ? (
            <ThemedText type="small" themeColor={line.difference.startsWith('-') ? 'textSecondary' : 'text'}>
              {line.difference.startsWith('-') ? '' : '+'}
              {formatMinor(line.difference, currency, i18n.language)}
              {line.differencePermille !== null ? ` (${formatPermille(line.differencePermille, i18n.language)})` : ''}
            </ThemedText>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

/** Planned (all lines), actual and difference of a group or the month, with how many lines are not tracked. */
export function TotalsSummary({ title, totals, currency }: { title: string; totals: TotalsView; currency: string }) {
  const { t, i18n } = useTranslation();
  const money = (m: string) => formatMinor(m, currency, i18n.language);
  return (
    <View style={styles.totals} accessible accessibilityLabel={`${title}: ${t('tracking.screen.planned')} ${money(totals.plannedAll)}, ${t('tracking.screen.actual')} ${money(totals.actual)}`}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <View style={styles.rowBetween}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('tracking.screen.planned')} {money(totals.plannedAll)}
        </ThemedText>
        <ThemedText type="small">
          {t('tracking.screen.actual')} {money(totals.actual)}
        </ThemedText>
      </View>
      {totals.notTrackedCount > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('tracking.screen.notTrackedCount', { count: totals.notTrackedCount })}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Who owes whom this month (US6, FR-030), with "Marquer comme réglé". */
export function BalanceCard({
  balances,
  nameOf,
  currency,
  onSettle,
}: {
  balances: TrackingView['balances'];
  nameOf: (membershipId: string) => string;
  currency: string;
  onSettle?: (b: TrackingView['balances'][number]) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <ThemedText type="smallBold" accessibilityRole="header">
        {t('tracking.balance.title')}
      </ThemedText>
      {balances.length === 0 ? (
        <ThemedText>{t('tracking.balance.settled')}</ThemedText>
      ) : (
        balances.map((b) => (
          <View key={`${b.from}-${b.to}`} style={styles.balance}>
            <ThemedText>
              {t('tracking.balance.owes', { from: nameOf(b.from), to: nameOf(b.to), amount: formatMinor(b.amountMinor, currency, i18n.language) })}
            </ThemedText>
            {onSettle ? <Button label={t('tracking.balance.markSettled')} variant="secondary" onPress={() => onSettle(b)} /> : null}
          </View>
        ))
      )}
    </Card>
  );
}

/** Meal vouchers left per member (US7, FR-033); a negative remaining shows an icon and text. */
export function VoucherCard({
  vouchers,
  nameOf,
  currency,
}: {
  vouchers: TrackingView['vouchers'];
  nameOf: (membershipId: string) => string;
  currency: string;
}) {
  const { t, i18n } = useTranslation();
  const shown = vouchers.filter((v) => v.incomeMinor !== '0' || v.spentMinor !== '0');
  if (shown.length === 0) return null;
  return (
    <Card>
      <ThemedText type="smallBold" accessibilityRole="header">
        {t('tracking.vouchers.title')}
      </ThemedText>
      {shown.map((v) => {
        const negative = v.remainingMinor.startsWith('-');
        return (
          <View key={v.membershipId} style={styles.rowBetween}>
            <ThemedText style={styles.flex}>{nameOf(v.membershipId)}</ThemedText>
            {negative ? (
              <StateBadge
                icon="alert"
                tone="danger"
                label={t('tracking.vouchers.over', { amount: formatMinor(v.remainingMinor.slice(1), currency, i18n.language) })}
              />
            ) : (
              <ThemedText>{t('tracking.vouchers.remaining', { amount: formatMinor(v.remainingMinor, currency, i18n.language) })}</ThemedText>
            )}
          </View>
        );
      })}
      {shown.some((v) => v.incomeMinor === '0') ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('tracking.vouchers.noIncome')}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.full,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: MinTouchTarget,
  },
  end: { alignItems: 'flex-end', gap: Spacing.one, flexShrink: 1 },
  link: { minHeight: MinTouchTarget, justifyContent: 'center' },
  totals: { gap: Spacing.one, paddingVertical: Spacing.two },
  balance: { gap: Spacing.two },
});
