import type { MemberSummaryView, MonthDetail, MonthSummaryView } from '@two-cents/shared/contracts';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Amount } from '@/components/amount';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { FontFamily, MinTouchTarget, Spacing } from '@/constants/theme';
import { formatMinor } from '@/features/budgets/format';

import { OverrunBadge } from './overrun-badge';

type Member = MonthDetail['members'][number];

/**
 * The month summary shown while editing (FR-031): for each member, what's left (with the overrun
 * badge when negative, FR-032) and the transfer to the joint account; details on demand.
 */
export function SummaryHeader({
  members,
  summary,
  currency,
}: {
  members: readonly Member[];
  summary: MonthSummaryView;
  currency: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const name = (m: Member) => m.displayName ?? t('budgets.anonymousFormerMember');
  return (
    <Card>
      <View style={styles.columns}>
        {members.map((m) => {
          const s = summary.members.find((x) => x.membershipId === m.membershipId);
          return s ? <MemberColumn key={m.membershipId} name={name(m)} s={s} currency={currency} open={open} /> : null;
        })}
      </View>
      {open ? <Household household={summary.household} currency={currency} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(open ? 'planning.summary.hideDetails' : 'planning.summary.showDetails')}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          void Haptics.selectionAsync();
          setOpen((v) => !v);
        }}
        style={styles.toggle}>
        <ThemedText type="small" themeColor="primary">
          {t(open ? 'planning.summary.hideDetails' : 'planning.summary.showDetails')}
        </ThemedText>
        <Icon name={open ? 'chevU' : 'chevD'} size={16} themeColor="primary" />
      </Pressable>
    </Card>
  );
}

function MemberColumn({
  name,
  s,
  currency,
  open,
}: {
  name: string;
  s: MemberSummaryView;
  currency: string;
  open: boolean;
}) {
  const { t, i18n } = useTranslation();
  const fmt = (minor: string) => formatMinor(minor, currency, i18n.language);
  return (
    <View
      style={styles.column}
      accessible
      accessibilityLabel={
        t('planning.summary.memberA11y', { name, left: fmt(s.whatsLeftMinor), transfer: fmt(s.transferMinor) }) +
        (s.overrun ? `, ${t('planning.overrun')}` : '')
      }>
      <ThemedText type="smallBold" numberOfLines={1}>
        {name}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('planning.summary.whatsLeft')}
      </ThemedText>
      <Amount minor={s.whatsLeftMinor} currency={currency} style={styles.big} />
      {s.overrun ? <OverrunBadge /> : null}
      <ThemedText type="small" themeColor="textSecondary">
        {t('planning.summary.transfer')}
      </ThemedText>
      <Amount minor={s.transferMinor} currency={currency} type="smallBold" />
      {open ? (
        <View style={styles.details}>
          <Row label={t('planning.summary.income')} minor={s.countedIncomeMinor} currency={currency} />
          <Row label={t('planning.groupsShort.personal')} minor={s.diMinor} currency={currency} />
          <Row label={t('planning.groupsShort.recurring_shared')} minor={s.dcrMinor} currency={currency} />
          <Row label={t('planning.groupsShort.one_off_shared')} minor={s.dceMinor} currency={currency} />
          <Row label={t('planning.summary.savings')} minor={s.savingsMinor} currency={currency} />
          {s.savingsRatePermille !== null ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('planning.summary.savingsRate')} :{' '}
              {t('planning.summary.savingsRateValue', {
                value: new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                }).format(s.savingsRatePermille / 10),
              })}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Household({ household, currency }: { household: MonthSummaryView['household']; currency: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.details}>
      <ThemedText type="smallBold">{t('planning.summary.household')}</ThemedText>
      <Row label={t('planning.summary.income')} minor={household.countedIncomeMinor} currency={currency} />
      <Row label={t('planning.summary.planned')} minor={household.plannedMinor} currency={currency} />
      <Row label={t('planning.summary.whatsLeft')} minor={household.whatsLeftMinor} currency={currency} />
      <Row label={t('planning.summary.transfer')} minor={household.transferMinor} currency={currency} />
    </View>
  );
}

function Row({ label, minor, currency }: { label: string; minor: string; currency: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <Amount minor={minor} currency={currency} type="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  column: { flexGrow: 1, flexBasis: 140, gap: Spacing.one },
  big: { fontSize: 22, lineHeight: 28, fontFamily: FontFamily.bold },
  details: { gap: Spacing.half, marginTop: Spacing.one },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  rowLabel: { flexShrink: 1 },
  toggle: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
});
