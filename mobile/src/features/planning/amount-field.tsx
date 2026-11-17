import { MAX_AMOUNT_MINOR, parseAmount, parseBoundedAmount } from '@two-cents/shared/domain';
import { useTranslation } from 'react-i18next';

import { TextField } from '@/components/form/text-field';

export type AmountError = 'invalid' | 'tooLarge' | null;

/** `12,5` → '1250'; nothing typed → null with no error; anything else → null with the reason (FR-026). */
export function readAmount(text: string, currency: string): { minor: string | null; error: AmountError } {
  if (text.trim() === '') return { minor: null, error: null };
  const bounded = parseBoundedAmount(text, currency);
  if (bounded !== null) return { minor: bounded.toString(), error: null };
  const raw = parseAmount(text, currency);
  return { minor: null, error: raw !== null && raw > MAX_AMOUNT_MINOR ? 'tooLarge' : 'invalid' };
}

/**
 * Amount input (FR-026): accepts `12,5`, `12.5` and spaces as thousands separators; refuses
 * anything else inline. The parent gets exact minor units as a string, never a float.
 */
export function AmountField({
  label,
  currency,
  value,
  onChange,
  editable = true,
  hint,
}: {
  label: string;
  currency: string;
  value: string;
  onChange: (text: string, minor: string | null) => void;
  editable?: boolean;
  hint?: string;
}) {
  const { t } = useTranslation();
  const { error } = readAmount(value, currency);
  return (
    <TextField
      label={label}
      value={value}
      editable={editable}
      hint={hint}
      keyboardType="decimal-pad"
      inputMode="decimal"
      autoCorrect={false}
      error={error ? t(`planning.amount.${error}`) : null}
      onChangeText={(text) => onChange(text, readAmount(text, currency).minor)}
      style={{ fontVariant: ['tabular-nums'] }}
    />
  );
}
