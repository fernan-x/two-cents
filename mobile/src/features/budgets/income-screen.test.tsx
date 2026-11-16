import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { budgetsApi } from '@/features/budgets/api';
import { BUDGET_ID, budgetDetail, withProviders } from '@/features/budgets/test-utils';

import Income from '@/app/(app)/budgets/[budgetId]/income';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ budgetId: '00000000-0000-7000-8000-0000000000b1' }),
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/features/budgets/api', () => ({
  budgetsApi: { putIncome: jest.fn(async () => ({ amountMinor: '245050', currency: 'EUR' })), get: jest.fn() },
}));

describe('Income step (FR-024, FR-025a)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('says who sees the amount, sends exact minor units and returns to the budget', async () => {
    await render(<Income />, { wrapper: withProviders(budgetDetail('member')) });
    expect(screen.getByText(/lecteurs compris, verront ce montant/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Revenus nets du mois (EUR)'), '2 450,50');
    await fireEvent.press(screen.getByLabelText('Enregistrer'));
    await waitFor(() => expect(budgetsApi.putIncome).toHaveBeenCalledWith(BUDGET_ID, '2026-11-01', '245050'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(`/budgets/${BUDGET_ID}`));
  });

  it('can be skipped', async () => {
    await render(<Income />, { wrapper: withProviders(budgetDetail('member')) });
    await fireEvent.press(screen.getByLabelText('Plus tard'));
    expect(mockReplace).toHaveBeenCalledWith(`/budgets/${BUDGET_ID}`);
    expect(budgetsApi.putIncome).not.toHaveBeenCalled();
  });

  it('keeps Save disabled for an invalid amount', async () => {
    await render(<Income />, { wrapper: withProviders(budgetDetail('member')) });
    await fireEvent.changeText(screen.getByLabelText('Revenus nets du mois (EUR)'), '12,345');
    expect(screen.getByLabelText('Enregistrer')).toBeDisabled();
  });
});
