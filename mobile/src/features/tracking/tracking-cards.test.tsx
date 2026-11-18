import { fireEvent, render, screen } from '@testing-library/react-native';
import type { LineTrackingView } from '@two-cents/shared/contracts';
import { I18nextProvider } from 'react-i18next';

import i18n from '@/i18n';

import { BalanceCard, EnvelopeCard, TrackingRow, VoucherCard } from './tracking-cards';

const ID = '00000000-0000-7000-8000-000000000001';
const M = '00000000-0000-7000-8000-00000000000a';
const F = '00000000-0000-7000-8000-00000000000b';

const envelope = (spent: string, remaining: string, over: string, progressPermille: number, level: 'ok' | 'warning' | 'over'): LineTrackingView => ({
  lineId: ID,
  group: 'recurring_shared',
  planned: '40000',
  actual: spent,
  difference: null,
  differencePermille: null,
  txnCount: 2,
  envelope: { spent, remaining, over, progressPermille, level, subItems: [] },
});

const wrap = (node: React.ReactNode) => render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
const names = (id: string) => (id === M ? 'Maëlle' : 'Fabien');

describe('tracking cards (US2, US6, US7)', () => {
  beforeAll(() => i18n.changeLanguage('fr'));

  it('shows spent and remaining with no warning under 80 %', async () => {
    await wrap(<EnvelopeCard label="Courses" line={envelope('25000', '15000', '0', 625, 'ok')} currency="EUR" />);
    expect(screen.getByText(/250,00\s€ dépensés sur 400,00\s€/)).toBeTruthy();
    expect(screen.getByText(/Reste 150,00\s€/)).toBeTruthy();
    expect(screen.queryByLabelText(/Attention/)).toBeNull();
  });

  it('shows a warning with an icon and text at 82,5 % (FR-026)', async () => {
    await wrap(<EnvelopeCard label="Courses" line={envelope('33000', '7000', '0', 825, 'warning')} currency="EUR" />);
    expect(screen.getByLabelText(/Attention : 82,5\s%/)).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toMatchObject({ now: 83 });
  });

  it('shows the overrun amount when over budget', async () => {
    await wrap(<EnvelopeCard label="Courses" line={envelope('42000', '0', '2000', 1050, 'over')} currency="EUR" />);
    expect(screen.getByLabelText(/Dépassement de 20,00\s€/)).toBeTruthy();
  });

  it('says "Non suivi" and offers "Payé comme prévu" for a line without transactions', async () => {
    const paid = jest.fn();
    await wrap(
      <TrackingRow label="Loyer" currency="EUR" onPaidAsPlanned={paid} line={{ planned: '95000', actual: null, difference: null, differencePermille: null }} />,
    );
    expect(screen.getByLabelText('Non suivi')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Payé comme prévu, Loyer'));
    expect(paid).toHaveBeenCalled();
  });

  it('states who owes whom and settles it', async () => {
    const settle = jest.fn();
    await wrap(<BalanceCard balances={[{ from: M, to: F, amountMinor: '2612' }]} nameOf={names} currency="EUR" onSettle={settle} />);
    expect(screen.getByText(/Maëlle doit 26,12\s€ à Fabien/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Marquer comme réglé'));
    expect(settle).toHaveBeenCalledWith({ from: M, to: F, amountMinor: '2612' });
  });

  it('says you are even when nothing is owed', async () => {
    await wrap(<BalanceCard balances={[]} nameOf={names} currency="EUR" />);
    expect(screen.getByText('Vous êtes à l’équilibre.')).toBeTruthy();
  });

  it('shows meal vouchers left, and an overrun with an icon and text', async () => {
    await wrap(
      <VoucherCard
        nameOf={names}
        currency="EUR"
        vouchers={[
          { membershipId: M, incomeMinor: '16000', spentMinor: '5750', remainingMinor: '10250' },
          { membershipId: F, incomeMinor: '0', spentMinor: '700', remainingMinor: '-700' },
        ]}
      />,
    );
    expect(screen.getByText(/Reste 102,50\s€/)).toBeTruthy();
    expect(screen.getByLabelText(/Dépassé de 7,00\s€/)).toBeTruthy();
    expect(screen.getByText(/Ajoutez vos titres-restaurant/)).toBeTruthy();
  });
});
