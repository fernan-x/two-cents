import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import i18n from '@/i18n';

import { AmountField, readAmount } from './amount-field';

describe('readAmount (FR-026)', () => {
  it.each([
    ['12,5', '1250'],
    ['12.5', '1250'],
    ['1 234,56', '123456'],
    ['0', '0'],
  ])('%s → %s', (text, minor) => {
    expect(readAmount(text, 'EUR')).toEqual({ minor, error: null });
  });

  it.each(['12,5a', '12,555', '-3', '1,2,3'])('refuses %s', (text) => {
    expect(readAmount(text, 'EUR')).toEqual({ minor: null, error: 'invalid' });
  });

  it('refuses amounts above 1 000 000,00 €', () => {
    expect(readAmount('1 000 000,01', 'EUR')).toEqual({ minor: null, error: 'tooLarge' });
  });

  it('empty is neither a value nor an error', () => {
    expect(readAmount('  ', 'EUR')).toEqual({ minor: null, error: null });
  });
});

function Harness({ onMinor }: { onMinor: (m: string | null) => void }) {
  const [text, setText] = useState('');
  return (
    <AmountField
      label="Montant"
      currency="EUR"
      value={text}
      onChange={(t, minor) => {
        setText(t);
        onMinor(minor);
      }}
    />
  );
}

describe('AmountField', () => {
  beforeAll(() => i18n.changeLanguage('fr'));
  const renderField = (onMinor = jest.fn()) =>
    render(
      <I18nextProvider i18n={i18n}>
        <Harness onMinor={onMinor} />
      </I18nextProvider>,
    );

  it('gives exact minor units for 12,5', async () => {
    const onMinor = jest.fn();
    await renderField(onMinor);
    await fireEvent.changeText(screen.getByLabelText('Montant'), '12,5');
    expect(onMinor).toHaveBeenLastCalledWith('1250');
  });

  it.each(['12,5a', '12,555', '-3'])('shows an error and gives null for %s', async (text) => {
    const onMinor = jest.fn();
    await renderField(onMinor);
    await fireEvent.changeText(screen.getByLabelText('Montant'), text);
    expect(onMinor).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
