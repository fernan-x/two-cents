import { render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import i18n from '@/i18n';

import { Amount } from './amount';

const renderFr = async (minor: string) => {
  await i18n.changeLanguage('fr');
  return render(
    <I18nextProvider i18n={i18n}>
      <Amount minor={minor} currency="EUR" />
    </I18nextProvider>,
  );
};

describe('Amount (Principle V)', () => {
  it('formats a negative amount and reads the sign as a word', async () => {
    await renderFr('-684');
    expect(screen.getByText(/6,84/)).toBeTruthy();
    expect(screen.getByText(/[-−]\s?6,84/)).toBeTruthy();
    expect(screen.getByLabelText(/^moins 6,84 euros$/)).toBeTruthy();
  });

  it('formats a positive amount with grouping', async () => {
    await renderFr('186252');
    expect(screen.getByText(/1\s862,52/)).toBeTruthy();
    expect(screen.getByLabelText(/1\s862,52 euros/)).toBeTruthy();
  });

  it('treats -0 as zero', async () => {
    await renderFr('-0');
    expect(screen.queryByLabelText(/moins/)).toBeNull();
  });
});
