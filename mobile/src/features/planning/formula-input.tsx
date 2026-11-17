import type { Formula } from '@two-cents/shared/contracts';
import { monthlyFromFormula } from '@two-cents/shared/domain';
import type { TFunction } from 'i18next';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { ChoiceRow } from '@/features/budgets/components';
import { formatMinor } from '@/features/budgets/format';

import { AmountField, readAmount } from './amount-field';

export type Frequency = 'monthly' | Formula['kind'];
const FREQUENCIES: Frequency[] = ['monthly', 'per_year', 'per_half_year', 'per_quarter', 'times'];

export interface FormulaValue {
  frequency: Frequency;
  /** The amount as typed. */
  base: string;
  /** "× N" only, as typed. */
  factor: string;
}

/**
 * The monthly amount and, unless monthly, the formula the API stores (FR-023). Null while the input
 * is incomplete or invalid. Rounding is the shared `monthlyFromFormula` (half-up to the cent).
 */
export function readFormula(value: FormulaValue, currency: string): { totalMinor: string; formula: Formula | null } | null {
  const base = readAmount(value.base, currency).minor;
  if (base === null) return null;
  if (value.frequency === 'monthly') return { totalMinor: base, formula: null };
  const factor = value.frequency === 'times' ? Number(value.factor) : 1;
  if (!Number.isInteger(factor) || factor < 1 || factor > 99) return null;
  try {
    const total = monthlyFromFormula({ kind: value.frequency, baseMinor: BigInt(base), factor });
    return { totalMinor: total.toString(), formula: { kind: value.frequency, baseMinor: base, factor } };
  } catch {
    return null;
  }
}

/** "80 €/an ÷ 12", the hint shown next to a periodic amount. */
export function formulaHint(t: TFunction, formula: Formula, currency: string, language: string): string {
  return t(`planning.formula.hint_${formula.kind}`, {
    amount: formatMinor(formula.baseMinor, currency, language),
    factor: formula.factor,
  });
}

/** Amount entry with a frequency: monthly, per year, half-year, quarter, or × N (FR-023). */
export function FormulaInput({
  label,
  currency,
  value,
  onChange,
}: {
  label: string;
  currency: string;
  value: FormulaValue;
  onChange: (value: FormulaValue) => void;
}) {
  const { t, i18n } = useTranslation();
  const result = readFormula(value, currency);
  return (
    <View style={styles.group}>
      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('planning.formula.title')}>
        <ThemedText type="smallBold">{t('planning.formula.title')}</ThemedText>
        {FREQUENCIES.map((f) => (
          <ChoiceRow
            key={f}
            label={t(`planning.formula.${f}`)}
            selected={value.frequency === f}
            onPress={() => onChange({ ...value, frequency: f })}
          />
        ))}
      </View>
      <AmountField
        label={value.frequency === 'monthly' ? label : t('planning.formula.base', { currency })}
        currency={currency}
        value={value.base}
        onChange={(base) => onChange({ ...value, base })}
      />
      {value.frequency === 'times' ? (
        <TextField
          label={t('planning.formula.factor')}
          value={value.factor}
          onChangeText={(factor) => onChange({ ...value, factor: factor.replace(/\D/g, '') })}
          keyboardType="number-pad"
          maxLength={2}
        />
      ) : null}
      {value.frequency !== 'monthly' && result?.formula ? (
        <ThemedText accessibilityLiveRegion="polite" type="smallBold">
          {t('planning.formula.result', { amount: formatMinor(result.totalMinor, currency, i18n.language) })}
          {' · '}
          {formulaHint(t, result.formula, currency, i18n.language)}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: Spacing.two } });
