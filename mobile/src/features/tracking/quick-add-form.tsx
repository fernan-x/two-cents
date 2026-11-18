import type { LineView, PaymentMethod, TransactionCreate, TransactionHints } from '@two-cents/shared/contracts';
import { defaultMethod, mostUsedLines, suggestLine, validatePayment, type Payer } from '@two-cents/shared/domain';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button } from '@/components/form';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { FontFamily, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { AmountKeypad, readKeypad } from './amount-keypad';

export interface QuickAddMember {
  membershipId: string;
  displayName: string | null;
}

export interface QuickAddResult {
  body: TransactionCreate;
  /** Receipt photos picked on the sheet, as base64 JPEG (uploaded after the create, R10). */
  photos: string[];
}

const METHODS: PaymentMethod[] = ['personal_card', 'joint_card', 'meal_voucher', 'cash', 'transfer'];

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function methodsFor(payer: Payer): PaymentMethod[] {
  return METHODS.filter((m) => {
    try {
      validatePayment(payer, m);
      return true;
    } catch {
      return false;
    }
  });
}

function Chip({
  label,
  selected,
  onPress,
  badge,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  badge?: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.primary : theme.backgroundElement, borderColor: selected ? theme.primary : theme.border },
      ]}>
      {selected ? <Icon name="check" size={14} color={theme.onPrimary} /> : null}
      <ThemedText type="small" style={{ color: selected ? theme.onPrimary : theme.text }} numberOfLines={1}>
        {label}
      </ThemedText>
      {badge ? (
        <ThemedText type="small" style={{ color: selected ? theme.onPrimary : theme.primary }}>
          · {badge}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title}
      </ThemedText>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

/**
 * The quick-add sheet's content (US1, US4, research R12): keypad first, then label and line chips;
 * everything else is defaulted (today, me, my usual payment method) and editable in place.
 */
export function QuickAddForm({
  currency,
  me,
  members,
  lines,
  hints,
  today,
  onSave,
  onPickPhoto,
  onDateChange,
}: {
  currency: string;
  me: string;
  members: readonly QuickAddMember[];
  lines: readonly LineView[];
  hints: TransactionHints | undefined;
  today: string;
  onSave: (result: QuickAddResult) => void;
  onPickPhoto?: () => Promise<string | null>;
  /** The lines shown belong to the date's month: the parent reloads them when the date changes. */
  onDateChange?: (date: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [step, setStep] = useState<'amount' | 'details'>('amount');
  const [text, setText] = useState('');
  const [refund, setRefund] = useState(false);
  const [label, setLabel] = useState('');
  const [lineId, setLineId] = useState<string | null>(null);
  const [lineTouched, setLineTouched] = useState(false);
  const [subItemId, setSubItemId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [date, setDate] = useState(today);
  const [payer, setPayer] = useState<Payer>({ kind: 'member', membershipId: me });
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [planned, setPlanned] = useState<boolean | null>(null);
  const [shared, setShared] = useState(false);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const amount = readKeypad(text, currency, refund);
  // Other members' personal lines are never offered (FR-009).
  const usable = useMemo(() => lines.filter((l) => l.group !== 'personal' || l.ownerMembershipId === me), [lines, me]);
  const refs = useMemo(
    () => usable.map((l) => ({ id: l.id, seriesId: l.seriesId, group: l.group, ownerMembershipId: l.ownerMembershipId })),
    [usable],
  );
  const suggested = useMemo(() => (hints ? suggestLine(label, hints.labels, refs) : null), [hints, label, refs]);
  const selectedLineId = lineTouched ? lineId : suggested;
  const chipIds = useMemo(() => {
    const top = mostUsedLines(hints?.mostUsed ?? [], refs, me);
    return suggested && !top.includes(suggested) ? [suggested, ...top.slice(0, 5)] : top;
  }, [hints, refs, me, suggested]);
  const line = usable.find((l) => l.id === selectedLineId) ?? null;
  const effectiveMethod = method && methodsFor(payer).includes(method) ? method : defaultMethod(payer, hints?.lastMethodByPayer ?? []);
  const effectivePlanned = planned ?? line !== null;
  const canSave = amount.minor !== null && label.trim().length > 0;

  const changeDate = (next: string) => {
    setDate(next);
    setLineTouched(false);
    setLineId(null);
    setSubItemId(null);
    onDateChange?.(next);
  };

  const chooseLine = (id: string | null) => {
    setLineTouched(true);
    setLineId(id);
    setSubItemId(null);
  };

  const save = () => {
    if (!amount.minor) return;
    const body: TransactionCreate = {
      date,
      amountMinor: amount.minor,
      label: label.trim(),
      payer,
      paymentMethod: effectiveMethod,
      parts: line ? [{ lineId: line.id, subItemId, amountMinor: amount.minor }] : [],
      ...(planned !== null ? { isPlanned: planned } : {}),
      ...(line ? {} : { isShared: shared }),
      note: note.trim() ? note.trim() : null,
      origin: 'quick_add',
      ...(suggested ? { suggestion: selectedLineId === suggested ? ('kept' as const) : ('changed' as const) } : {}),
    };
    onSave({ body, photos });
  };

  if (step === 'amount') {
    return (
      <View style={styles.wrap}>
        <AmountKeypad value={text} onChange={setText} refund={refund} onRefundChange={setRefund} currency={currency} />
        <Button label={t('common.continue')} disabled={amount.minor === null} onPress={() => setStep('details')} />
      </View>
    );
  }

  const lineName = (id: string) => usable.find((l) => l.id === id)?.label ?? '';
  const memberName = (id: string) => members.find((m) => m.membershipId === id)?.displayName ?? t('planning.history.someone');

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" accessibilityLabel={t('tracking.quickAdd.amount')} onPress={() => setStep('amount')}>
        <ThemedText style={[styles.amountSummary, { color: refund ? theme.success : theme.text }]}>
          {refund ? '−' : ''}
          {text}
        </ThemedText>
      </Pressable>
      <TextInput
        autoFocus
        accessibilityLabel={t('tracking.quickAdd.label')}
        placeholder={t('tracking.quickAdd.labelPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        value={label}
        onChangeText={setLabel}
        maxLength={60}
        returnKeyType="done"
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
      />

      <Row title={t('tracking.quickAdd.line')}>
        {(showAll ? usable.map((l) => l.id) : chipIds).map((id) => (
          <Chip
            key={id}
            testID={`line-${id}`}
            label={lineName(id)}
            badge={id === suggested ? t('tracking.quickAdd.suggested') : undefined}
            selected={selectedLineId === id}
            onPress={() => chooseLine(id)}
          />
        ))}
        <Chip label={t('tracking.quickAdd.noLine')} selected={selectedLineId === null} onPress={() => chooseLine(null)} testID="line-none" />
        {!showAll ? <Chip label={t('tracking.quickAdd.allLines')} selected={false} onPress={() => setShowAll(true)} /> : null}
      </Row>

      {line && line.subItems.length > 0 ? (
        <Row title={t('tracking.quickAdd.subItem')}>
          {line.subItems.map((s) => (
            <Chip key={s.id} label={s.label} selected={subItemId === s.id} onPress={() => setSubItemId(subItemId === s.id ? null : s.id)} />
          ))}
        </Row>
      ) : null}

      <Row title={t('tracking.quickAdd.date')}>
        <Chip label="‹" selected={false} onPress={() => changeDate(addDays(date, -1))} />
        <ThemedText style={styles.date}>{date === today ? t('tracking.quickAdd.today') : new Date(`${date}T12:00:00Z`).toLocaleDateString()}</ThemedText>
        <Chip label="›" selected={false} onPress={() => changeDate(addDays(date, 1))} />
      </Row>

      <Row title={t('tracking.quickAdd.payer')}>
        {members.map((m) => (
          <Chip
            key={m.membershipId}
            label={m.membershipId === me ? `${memberName(me)}` : memberName(m.membershipId)}
            selected={payer.kind === 'member' && payer.membershipId === m.membershipId}
            onPress={() => setPayer({ kind: 'member', membershipId: m.membershipId })}
          />
        ))}
        <Chip label={t('tracking.jointAccount')} selected={payer.kind === 'joint'} onPress={() => setPayer({ kind: 'joint' })} />
      </Row>

      <Row title={t('tracking.quickAdd.method')}>
        {methodsFor(payer).map((m) => (
          <Chip key={m} label={t(`tracking.methods.${m}`)} selected={effectiveMethod === m} onPress={() => setMethod(m)} />
        ))}
      </Row>

      <View style={styles.switchRow}>
        <ThemedText>{effectivePlanned ? t('tracking.planned') : t('tracking.unplanned')}</ThemedText>
        <Switch accessibilityLabel={t('tracking.planned')} value={effectivePlanned} onValueChange={setPlanned} />
      </View>
      {line === null ? (
        <View style={styles.switchRow}>
          <ThemedText>{t('tracking.forHousehold')}</ThemedText>
          <Switch accessibilityLabel={t('tracking.forHousehold')} value={shared} onValueChange={setShared} />
        </View>
      ) : null}

      <TextInput
        accessibilityLabel={t('tracking.quickAdd.note')}
        placeholder={t('tracking.quickAdd.note')}
        placeholderTextColor={theme.textSecondary}
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
        style={[styles.input, styles.note, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
      />
      {onPickPhoto && photos.length < 3 ? (
        <Chip
          label={`${t('tracking.quickAdd.photo')}${photos.length ? ` (${photos.length})` : ''}`}
          selected={false}
          onPress={() => void onPickPhoto().then((p) => p && setPhotos((all) => [...all, p]))}
        />
      ) : null}

      <Button label={t('tracking.quickAdd.save')} disabled={!canSave} onPress={save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three, padding: Spacing.three },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  chip: {
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: '100%',
  },
  amountSummary: { fontFamily: FontFamily.bold, fontSize: 32, lineHeight: 40, textAlign: 'center', fontVariant: ['tabular-nums'] },
  input: { minHeight: MinTouchTarget, borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: Spacing.three, fontFamily: FontFamily.regular, fontSize: 17 },
  note: { minHeight: 64, paddingVertical: Spacing.two },
  date: { minWidth: 120, textAlign: 'center' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: MinTouchTarget },
});
