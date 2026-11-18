import { fireEvent, render, screen } from '@testing-library/react-native';
import type { LineView } from '@two-cents/shared/contracts';
import { I18nextProvider } from 'react-i18next';

import i18n from '@/i18n';

import { QuickAddForm } from './quick-add-form';

const lines = Array.from({ length: 40 }, (_, i) => ({
  id: `l${i}`,
  seriesId: `s${i}`,
  group: 'recurring_shared',
  label: `Ligne ${i}`,
  ownerMembershipId: null,
  subItems: [],
})) as unknown as LineView[];

/**
 * SC-001 / Principle IV budget: the sheet mounts fast with cached data, and saving hands the body
 * over synchronously, without waiting for any network call (FR-010). The full < 10 s median is a
 * usability test (quickstart.md).
 */
describe('quick add timing (T113)', () => {
  beforeAll(() => i18n.changeLanguage('fr'));

  it('mounts under 300 ms and saves without awaiting anything', async () => {
    const onSave = jest.fn();
    const t0 = performance.now();
    await render(
      <I18nextProvider i18n={i18n}>
        <QuickAddForm currency="EUR" me="me" members={[{ membershipId: 'me', displayName: 'Fabien' }]} lines={lines} hints={undefined} today="2026-11-17" onSave={onSave} />
      </I18nextProvider>,
    );
    expect(performance.now() - t0).toBeLessThan(300);
    await fireEvent.press(screen.getByTestId('key-9'));
    await fireEvent.press(screen.getByText('Continuer'));
    await fireEvent.changeText(screen.getByLabelText('Libellé'), 'Total');
    await fireEvent.press(screen.getByTestId('line-l0'));
    await fireEvent.press(screen.getByText('Enregistrer'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
