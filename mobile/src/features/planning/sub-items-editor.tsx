import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, TextField } from '@/components/form';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { formatMinor } from '@/features/budgets/format';

import { AmountField, readAmount } from './amount-field';

export interface SubItemInputValue {
  key: string;
  label: string;
  amount: string;
}

/** Remaining amount, or how much the sub-items exceed the total (FR-015); null when unreadable. */
export function subItemsBalance(items: readonly SubItemInputValue[], totalMinor: string | null, currency: string) {
  if (totalMinor === null) return null;
  let sum = 0n;
  for (const item of items) {
    if (!item.amount.trim()) continue;
    const read = readAmount(item.amount, currency);
    if (read.minor === null) return null;
    sum += BigInt(read.minor);
  }
  return BigInt(totalMinor) - sum;
}

/** Sub-items of an envelope (FR-015): a label and an optional amount each. */
export function SubItemsEditor({
  items,
  onChange,
  totalMinor,
  currency,
}: {
  items: SubItemInputValue[];
  onChange: (items: SubItemInputValue[]) => void;
  totalMinor: string | null;
  currency: string;
}) {
  const { t, i18n } = useTranslation();
  const balance = subItemsBalance(items, totalMinor, currency);
  const set = (index: number, patch: Partial<SubItemInputValue>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <View style={styles.group}>
      <ThemedText type="smallBold">{t('planning.envelope.subItems')}</ThemedText>
      {items.map((item, index) => (
        <View key={item.key} style={styles.item}>
          <View style={styles.flex}>
            <TextField
              label={t('planning.envelope.subItemLabel', { index: index + 1 })}
              value={item.label}
              onChangeText={(label) => set(index, { label })}
              maxLength={40}
            />
            <AmountField
              label={t('planning.envelope.subItemAmount', { currency })}
              currency={currency}
              value={item.amount}
              onChange={(amount) => set(index, { amount })}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('planning.envelope.removeSubItem', {
              label: item.label || t('planning.envelope.subItemLabel', { index: index + 1 }),
            })}
            onPress={() => onChange(items.filter((_, i) => i !== index))}
            style={styles.remove}>
            <Icon name="trash" size={18} themeColor="textSecondary" />
          </Pressable>
        </View>
      ))}
      <Button
        variant="secondary"
        label={t('planning.envelope.addSubItem')}
        onPress={() => onChange([...items, { key: `${Date.now()}-${items.length}`, label: '', amount: '' }])}
      />
      {balance !== null && items.some((i) => i.amount.trim()) ? (
        <ThemedText accessibilityLiveRegion="polite" type="smallBold">
          {balance >= 0n
            ? t('planning.envelope.remaining', { amount: formatMinor(balance.toString(), currency, i18n.language) })
            : t('planning.envelope.exceed', { amount: formatMinor((-balance).toString(), currency, i18n.language) })}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.two },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, gap: Spacing.two },
  remove: { width: MinTouchTarget, height: MinTouchTarget, alignItems: 'center', justifyContent: 'center' },
});
