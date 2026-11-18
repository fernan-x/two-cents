import { fireEvent, render, screen } from '@testing-library/react-native';
import type { LineView, TransactionHints } from '@two-cents/shared/contracts';
import { I18nextProvider } from 'react-i18next';

import i18n from '@/i18n';

import { QuickAddForm, type QuickAddResult } from './quick-add-form';

const ME = '00000000-0000-7000-8000-000000000001';
const PARTNER = '00000000-0000-7000-8000-000000000002';

const line = (id: string, label: string, over: Partial<LineView> = {}): LineView => ({
  id,
  seriesId: `s-${id}`,
  group: 'recurring_shared',
  kind: 'expense',
  label,
  categoryId: null,
  isEnvelope: true,
  subItems: [],
  ownerMembershipId: null,
  isPrivate: false,
  splitMode: 'custom',
  payerMembershipId: null,
  totalMinor: '40000',
  shares: [],
  formula: null,
  position: 0,
  version: 1,
  isException: false,
  usualTotalMinor: null,
  needsReview: false,
  needsIncome: false,
  editable: true,
  ...over,
});

const lines = [
  line('courses', 'Courses'),
  line('carbu', 'Carburant'),
  line('anim', 'Animalerie', { subItems: [{ id: 'croq', label: 'Croquettes', amountMinor: null }] }),
  line('phone-p', 'Forfait partenaire', { group: 'personal', ownerMembershipId: PARTNER, splitMode: null }),
];

const hints: TransactionHints = {
  windowDays: 90,
  labels: [{ normalizedLabel: 'leclerc', seriesId: 's-courses', count: 3, lastUsedAt: '2026-11-10T10:00:00.000Z' }],
  mostUsed: [{ seriesId: 's-carbu', count: 5 }],
  lastMethodByPayer: [],
};

async function renderForm(onSave: (r: QuickAddResult) => void, h: TransactionHints | undefined = hints) {
  await render(
    <I18nextProvider i18n={i18n}>
      <QuickAddForm
        currency="EUR"
        me={ME}
        members={[
          { membershipId: ME, displayName: 'Fabien' },
          { membershipId: PARTNER, displayName: 'Maëlle' },
        ]}
        lines={lines}
        hints={h}
        today="2026-11-17"
        onSave={onSave}
      />
    </I18nextProvider>,
  );
}

async function typeAmount(keys: string[]) {
  for (const k of keys) await fireEvent.press(screen.getByTestId(`key-${k}`));
  await fireEvent.press(screen.getByText('Continuer'));
}

describe('QuickAddForm (US1, US4)', () => {
  beforeAll(() => i18n.changeLanguage('fr'));

  it('saves amount, label and a chip line with every default (FR-008)', async () => {
    const onSave = jest.fn();
    await renderForm(onSave, undefined);
    await typeAmount(['4', '2', 'sep', '3']);
    await fireEvent.changeText(screen.getByLabelText('Libellé'), 'Boulangerie');
    await fireEvent.press(screen.getByTestId('line-courses'));
    await fireEvent.press(screen.getByText('Enregistrer'));
    expect(onSave).toHaveBeenCalledWith({
      body: {
        date: '2026-11-17',
        amountMinor: '4230',
        label: 'Boulangerie',
        payer: { kind: 'member', membershipId: ME },
        paymentMethod: 'personal_card',
        parts: [{ lineId: 'courses', subItemId: null, amountMinor: '4230' }],
        note: null,
        origin: 'quick_add',
      },
      photos: [],
    });
  });

  it('orders chips by use and never offers another member personal line (FR-009)', async () => {
    await renderForm(jest.fn());
    await typeAmount(['5']);
    const ids = screen.getAllByTestId(/^line-/).map((n) => n.props.testID);
    expect(ids.slice(0, 2)).toEqual(['line-carbu', 'line-courses']);
    expect(ids).not.toContain('line-phone-p');
  });

  it('preselects the suggested line and reports it kept (FR-011, FR-013)', async () => {
    const onSave = jest.fn();
    await renderForm(onSave);
    await typeAmount(['5']);
    await fireEvent.changeText(screen.getByLabelText('Libellé'), 'LECLERC ');
    expect(screen.getByTestId('line-courses').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByText('Enregistrer'));
    expect(onSave.mock.calls[0][0].body).toMatchObject({ parts: [{ lineId: 'courses' }], suggestion: 'kept' });
  });

  it('reports a changed suggestion and preselects nothing for an unknown label', async () => {
    const onSave = jest.fn();
    await renderForm(onSave);
    await typeAmount(['5']);
    await fireEvent.changeText(screen.getByLabelText('Libellé'), 'Inconnu');
    expect(screen.getByTestId('line-none').props.accessibilityState.selected).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Libellé'), 'leclerc');
    await fireEvent.press(screen.getByTestId('line-carbu'));
    await fireEvent.press(screen.getByText('Enregistrer'));
    expect(onSave.mock.calls[0][0].body).toMatchObject({ parts: [{ lineId: 'carbu' }], suggestion: 'changed' });
  });

  it('offers sub-items only for lines that have them, and "for the household" without a line', async () => {
    await renderForm(jest.fn(), undefined);
    await typeAmount(['5']);
    expect(screen.getByLabelText('Pour le foyer')).toBeTruthy();
    expect(screen.queryByText('Croquettes')).toBeNull();
    await fireEvent.press(screen.getByTestId('line-anim'));
    expect(screen.getByText('Croquettes')).toBeTruthy();
    expect(screen.queryByLabelText('Pour le foyer')).toBeNull();
  });

  it('only offers payment methods allowed for the payer (FR-005)', async () => {
    await renderForm(jest.fn(), undefined);
    await typeAmount(['5']);
    expect(screen.queryByText('Carte commune')).toBeNull();
    await fireEvent.press(screen.getByText('Compte commun'));
    expect(screen.getByText('Carte commune')).toBeTruthy();
    expect(screen.queryByText('Titre-restaurant')).toBeNull();
  });
});
