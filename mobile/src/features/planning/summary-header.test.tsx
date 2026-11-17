import { computeMonthSummary } from '@two-cents/shared/domain';
import type { MonthDetail, MonthSummaryView } from '@two-cents/shared/contracts';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import i18n from '@/i18n';

import { SummaryHeader } from './summary-header';

const MAELLE = '00000000-0000-7000-8000-00000000000a';
const FABIEN = '00000000-0000-7000-8000-00000000000b';

/** The spec's corrected Novembre 2026 figures (SC-003). */
const summary: MonthSummaryView = {
  members: [
    {
      membershipId: MAELLE,
      countedIncomeMinor: '200000',
      otherIncomeMinor: '0',
      diMinor: '14432',
      dcrMinor: '158752',
      dceMinor: '27500',
      whatsLeftMinor: '-684',
      transferMinor: '186252',
      savingsMinor: '28192',
      savingsRatePermille: 141,
      overrun: true,
    },
    {
      membershipId: FABIEN,
      countedIncomeMinor: '299000',
      otherIncomeMinor: '16000',
      diMinor: '58932',
      dcrMinor: '196752',
      dceMinor: '27500',
      whatsLeftMinor: '15816',
      transferMinor: '224252',
      savingsMinor: '75500',
      savingsRatePermille: 253,
      overrun: false,
    },
  ],
  household: {
    countedIncomeMinor: '499000',
    otherIncomeMinor: '16000',
    plannedMinor: '483868',
    whatsLeftMinor: '15132',
    transferMinor: '410504',
    savingsMinor: '103692',
  },
};

const members: MonthDetail['members'] = [
  { membershipId: MAELLE, displayName: 'Maëlle', formerMember: false, isMe: true, order: 0 },
  { membershipId: FABIEN, displayName: 'Fabien', formerMember: false, isMe: false, order: 1 },
];

const renderHeader = async () => {
  await i18n.changeLanguage('fr');
  return render(
    <I18nextProvider i18n={i18n}>
      <SummaryHeader members={members} summary={summary} currency="EUR" />
    </I18nextProvider>,
  );
};

describe('SummaryHeader (FR-031, FR-032)', () => {
  it('shows each member what is left and the transfer', async () => {
    await renderHeader();
    expect(screen.getByText(/1\s862,52/)).toBeTruthy();
    expect(screen.getByText(/2\s242,52/)).toBeTruthy();
    expect(screen.getByText(/158,16/)).toBeTruthy();
    expect(screen.getByText(/[-−]\s?6,84/)).toBeTruthy();
  });

  it('flags only Maëlle with the overrun badge (icon + text, not color alone)', async () => {
    await renderHeader();
    expect(screen.getAllByText('Dépassement')).toHaveLength(1);
    expect(screen.getByLabelText(/^Maëlle .*Dépassement$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Fabien : reste à vivre 158,16/).props.accessibilityLabel).not.toMatch(
      /Dépassement/,
    );
  });

  it('opens the details with the savings rate and household totals', async () => {
    await renderHeader();
    await fireEvent.press(screen.getByLabelText('Afficher le détail'));
    expect(screen.getByText(/14,1\s?%/)).toBeTruthy();
    expect(screen.getByText(/4\s838,68/)).toBeTruthy();
  });

  it('matches the shared calculation (same function as the backend)', () => {
    const result = computeMonthSummary({
      members: [
        { membershipId: MAELLE, order: 0 },
        { membershipId: FABIEN, order: 1 },
      ],
      incomes: [{ membershipId: MAELLE, amount: 200000n, counts: true }],
      lines: [{ group: 'personal', kind: 'expense', total: 200684n, shares: { [MAELLE]: 200684n } }],
      privateAggregates: [],
    });
    expect(result.members[0].whatsLeft.toString()).toBe(summary.members[0].whatsLeftMinor);
  });
});
