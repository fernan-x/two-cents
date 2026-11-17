import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { minorDigits } from '@two-cents/shared/domain';
import { useTranslation } from 'react-i18next';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { formatMinor } from '@/features/budgets/format';

/**
 * The single way to show an amount (constitution Principle V): exact minor units as a string,
 * possibly negative, formatted for the person's locale with tabular figures. Screen readers hear
 * the sign as a word ("moins 6,84 €"), never a bare dash.
 */
export function Amount({
  minor,
  currency,
  style,
  type,
  themeColor,
}: {
  /** Integer minor units as a string, e.g. "-684". */
  minor: string;
  currency: string;
  style?: StyleProp<TextStyle>;
  type?: ThemedTextProps['type'];
  themeColor?: ThemedTextProps['themeColor'];
}) {
  const { t, i18n } = useTranslation();
  const negative = minor.startsWith('-') && /[1-9]/.test(minor);
  const text = formatMinor(minor, currency, i18n.language);
  const absolute = spoken(minor.replace(/^-/, ''), currency, i18n.language);
  return (
    <ThemedText
      type={type}
      themeColor={themeColor}
      accessibilityLabel={negative ? t('planning.amount.negative', { amount: absolute }) : absolute}
      style={[styles.tabular, style]}>
      {text}
    </ThemedText>
  );
}

/** "684" → "6,84 euros": the currency name reads better than its symbol with a screen reader. */
function spoken(amountMinor: string, currency: string, language: string): string {
  const digits = minorDigits(currency);
  const padded = amountMinor.padStart(digits + 1, '0');
  const major = digits > 0 ? `${padded.slice(0, -digits)}.${padded.slice(-digits)}` : padded;
  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency',
    currency,
    currencyDisplay: 'name',
  }).format(Number(major));
}

const styles = StyleSheet.create({ tabular: { fontVariant: ['tabular-nums'] } });
