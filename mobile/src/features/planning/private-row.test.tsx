import { render, screen } from '@testing-library/react-native';

import { budgetDetail, withProviders } from '@/features/budgets/test-utils';

import { PrivateRow } from './private-row';

describe('PrivateRow (FR-019)', () => {
  it('shows one "Privé" amount with no label or action', async () => {
    await render(
      <PrivateRow
        aggregate={{ membershipId: '00000000-0000-7000-8000-00000000000a', totalMinor: '10000', savingsMinor: '0', count: 2 }}
        currency="EUR"
      />,
      { wrapper: withProviders(budgetDetail('member')) },
    );
    expect(screen.getByText('Privé')).toBeTruthy();
    expect(screen.getByLabelText(/Privé, 2 lignes, 100,00/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
