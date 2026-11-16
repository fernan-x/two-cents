import { render, screen } from '@testing-library/react-native';

import { budgetKeys } from '@/features/budgets/query-keys';
import { BUDGET_ID, budgetDetail, member, withProviders } from '@/features/budgets/test-utils';

import Members from '@/app/(app)/budgets/[budgetId]/members/index';
import { SettingsForm } from '@/app/(app)/budgets/[budgetId]/settings/index';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ budgetId: '00000000-0000-7000-8000-0000000000b1' }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/features/budgets/api', () => ({ budgetsApi: {} }));

const people = {
  members: [
    member(),
    member({
      membershipId: '00000000-0000-7000-8000-000000000002',
      displayName: 'Comptable',
      role: 'viewer',
      isMe: true,
    }),
  ],
  formerMembers: [],
};

describe('Viewer (US7): no edit controls', () => {
  it('members: no invite, no member actions, but can leave', async () => {
    await render(<Members />, {
      wrapper: withProviders(budgetDetail('viewer'), [[budgetKeys.members(BUDGET_ID), people]]),
    });
    expect(screen.queryByLabelText('Inviter quelqu’un')).toBeNull();
    expect(screen.queryByText('Historique')).toBeNull();
    expect(screen.getByLabelText('Quitter le budget')).toBeTruthy();
    // Rows are not buttons for a viewer.
    expect(screen.queryAllByRole('button', { name: /Fabien/ })).toHaveLength(0);
    expect(screen.getByLabelText(/Comptable \(vous\), Lecteur/)).toBeTruthy();
  });

  it('settings: read-only, no save, no delete', async () => {
    await render(<SettingsForm budget={budgetDetail('viewer')} />, { wrapper: withProviders(budgetDetail('viewer')) });
    expect(screen.getByText(/Seuls le propriétaire et les admins/)).toBeTruthy();
    expect(screen.queryByLabelText('Enregistrer')).toBeNull();
    expect(screen.queryByLabelText('Supprimer le budget')).toBeNull();
    expect(screen.getByLabelText('Nom').props.editable).toBe(false);
  });

  it('an Admin can edit settings but not delete', async () => {
    await render(<SettingsForm budget={budgetDetail('admin')} />, { wrapper: withProviders(budgetDetail('admin')) });
    expect(screen.getByLabelText('Enregistrer')).toBeTruthy();
    expect(screen.queryByLabelText('Supprimer le budget')).toBeNull();
  });
});
