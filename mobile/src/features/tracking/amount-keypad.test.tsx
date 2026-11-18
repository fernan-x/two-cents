import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import i18n from '@/i18n';

import { AmountKeypad, KEY_SIZE, pressKey, readKeypad } from './amount-keypad';

describe('readKeypad (FR-003)', () => {
  it.each([
    ['42,3', false, '4230'],
    ['42.3', false, '4230'],
    ['1 042,30', false, '104230'],
    ['20', true, '-2000'],
  ])('%s (refund %s) → %s', (text, refund, minor) => {
    expect(readKeypad(text, 'EUR', refund)).toEqual({ minor, error: null });
  });

  it('refuses invalid, zero and too large amounts', () => {
    expect(readKeypad('12,555', 'EUR', false).error).toBe('invalid');
    expect(readKeypad('0', 'EUR', false).error).toBe('zero');
    expect(readKeypad('1000000,01', 'EUR', false).error).toBe('tooLarge');
    expect(readKeypad('', 'EUR', false)).toEqual({ minor: null, error: null });
  });
});

describe('pressKey', () => {
  it('builds an amount, one separator, two decimals at most', () => {
    let text = '';
    for (const k of ['4', '2', 'sep', '3', '0', '5']) text = pressKey(text, k, ',', 'EUR');
    expect(text).toBe('42,30');
    expect(pressKey('42,30', 'sep', ',', 'EUR')).toBe('42,30');
    expect(pressKey('42,30', 'del', ',', 'EUR')).toBe('42,3');
    expect(pressKey('', 'sep', ',', 'EUR')).toBe('0,');
    expect(pressKey('0', '7', ',', 'EUR')).toBe('7');
  });
});

function Harness() {
  const [text, setText] = useState('');
  const [refund, setRefund] = useState(false);
  return (
    <I18nextProvider i18n={i18n}>
      <AmountKeypad value={text} onChange={setText} refund={refund} onRefundChange={setRefund} currency="EUR" />
    </I18nextProvider>
  );
}

describe('AmountKeypad (US1)', () => {
  beforeAll(() => i18n.changeLanguage('fr'));

  it('types 42,30 with the keys and labels every key for screen readers', async () => {
    await render(<Harness />);
    for (const k of ['4', '2', 'sep', '3']) await fireEvent.press(screen.getByTestId(`key-${k}`));
    expect(screen.getByLabelText(/Montant 42,3/)).toBeTruthy();
    expect(screen.getByLabelText('Virgule')).toBeTruthy();
    expect(screen.getByLabelText('Effacer')).toBeTruthy();
    expect(KEY_SIZE).toBeGreaterThanOrEqual(44);
  });

  it('turns the amount into a refund with the toggle', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('key-5'));
    await fireEvent(screen.getByLabelText('Remboursement'), 'valueChange', true);
    expect(screen.getByLabelText(/Montant Remboursement 5/)).toBeTruthy();
  });
});
