import { MAX_AMOUNT_MINOR, minorDigits, parseAmount } from '@two-cents/shared/domain';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Keys are larger than the 44 pt minimum: the keypad is the fastest way in (R12). */
export const KEY_SIZE = 64;

export type KeypadError = 'invalid' | 'tooLarge' | 'zero' | null;

/**
 * What the keypad holds, as exact minor units (Principle I): `"-2000"` for a 20 € refund. Null with
 * no error while empty; an error when the text cannot be an amount.
 */
export function readKeypad(text: string, currency: string, refund: boolean): { minor: string | null; error: KeypadError } {
  if (!text.trim()) return { minor: null, error: null };
  const value = parseAmount(text, currency);
  if (value === null) return { minor: null, error: 'invalid' };
  if (value > MAX_AMOUNT_MINOR) return { minor: null, error: 'tooLarge' };
  if (value === 0n) return { minor: null, error: 'zero' };
  return { minor: (refund ? -value : value).toString(), error: null };
}

/** Applies one key to the text; refuses what would exceed the currency's decimals. */
export function pressKey(text: string, key: string, separator: string, currency: string): string {
  if (key === 'del') return text.slice(0, -1);
  if (key === 'sep') {
    if (text.includes(separator) || minorDigits(currency) === 0) return text;
    return (text || '0') + separator;
  }
  const [, decimals] = text.split(separator);
  if (decimals !== undefined && decimals.length >= minorDigits(currency)) return text;
  if (text === '0') return key;
  if (text.replace(separator, '').length >= 9) return text;
  return text + key;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['sep', '0', 'del'],
];

/** The in-app amount keypad of the quick-add sheet (US1, research R12). */
export function AmountKeypad({
  value,
  onChange,
  refund,
  onRefundChange,
  currency,
}: {
  value: string;
  onChange: (text: string) => void;
  refund: boolean;
  onRefundChange: (refund: boolean) => void;
  currency: string;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const separator = i18n.language === 'en' ? '.' : ',';
  const { error } = readKeypad(value, currency, refund);
  const symbol = new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', { style: 'currency', currency })
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value;

  return (
    <View style={styles.wrap}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${t('tracking.quickAdd.amount')} ${refund ? `${t('tracking.refund')} ` : ''}${value || '0'} ${symbol ?? currency}`}
        style={styles.display}>
        <ThemedText style={[styles.amount, { color: refund ? theme.success : theme.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {refund ? '−' : ''}
          {value || '0'} {symbol}
        </ThemedText>
      </View>
      {error ? (
        <View accessibilityLiveRegion="polite" style={styles.errorRow}>
          <Icon name="alert" size={16} color={theme.danger} />
          <ThemedText type="small" themeColor="danger">
            {t(error === 'tooLarge' ? 'tracking.quickAdd.tooLarge' : error === 'zero' ? 'tracking.quickAdd.zero' : 'tracking.quickAdd.invalidAmount')}
          </ThemedText>
        </View>
      ) : null}
      <View style={styles.refundRow}>
        <ThemedText type="small">{t('tracking.refund')}</ThemedText>
        <Switch accessibilityLabel={t('tracking.refund')} value={refund} onValueChange={onRefundChange} />
      </View>
      {ROWS.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((key) => {
            const label = key === 'sep' ? separator : key === 'del' ? '' : key;
            const a11y = key === 'sep' ? t('tracking.quickAdd.keyComma') : key === 'del' ? t('tracking.quickAdd.keyDelete') : key;
            return (
              <Pressable
                key={key}
                testID={`key-${key}`}
                accessibilityRole="keyboardkey"
                accessibilityLabel={a11y}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onChange(pressKey(value, key, separator, currency));
                }}
                style={({ pressed }) => [
                  styles.key,
                  { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
                ]}>
                {key === 'del' ? (
                  <Icon name="arrowL" size={24} color={theme.text} />
                ) : (
                  <ThemedText style={styles.keyText}>{label}</ThemedText>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  display: { alignItems: 'center', paddingVertical: Spacing.three },
  amount: { fontFamily: FontFamily.bold, fontSize: 44, lineHeight: 52, fontVariant: ['tabular-nums'] },
  errorRow: { flexDirection: 'row', gap: Spacing.one, alignItems: 'center', justifyContent: 'center' },
  refundRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  row: { flexDirection: 'row', gap: Spacing.two },
  key: { flex: 1, height: KEY_SIZE, minWidth: KEY_SIZE, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: FontFamily.semibold, fontSize: 26, lineHeight: 32 },
});
