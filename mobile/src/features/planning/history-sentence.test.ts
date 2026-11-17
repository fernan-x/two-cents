import type { ChangeView } from '@two-cents/shared/contracts';
import i18n from '@/i18n';

import { historySentence } from './history-sentence';

const FABIEN = { membershipId: '00000000-0000-7000-8000-00000000000b', displayName: 'Fabien', formerMember: false };

const change = (over: Partial<ChangeView>): ChangeView => ({
  id: '00000000-0000-7000-8000-0000000000e1',
  at: '2026-11-16T10:00:00.000Z',
  actor: FABIEN,
  cause: 'user',
  entity: 'line',
  action: 'updated',
  private: false,
  label: 'Courses',
  changes: [],
  ...over,
});

const say = (c: ChangeView) => historySentence(c, { t: i18n.t.bind(i18n), currency: 'EUR', language: 'fr' });
const normalize = (s: string) => s.replace(/[  ]/g, ' ');

describe('historySentence (FR-035)', () => {
  beforeAll(() => i18n.changeLanguage('fr'));

  it('says an amount change with both amounts', () => {
    expect(
      normalize(say(change({ changes: [{ field: 'totalMinor', old: '28000', new: '30000' }] }))),
    ).toBe('Fabien a modifié Courses de 280,00 € à 300,00 €');
  });

  it('hides the details of a private line', () => {
    expect(say(change({ private: true, label: null }))).toBe('Fabien a modifié une ligne privée');
  });

  it('covers creations, deletions, status and recomputes', () => {
    expect(say(change({ action: 'created' }))).toBe('Fabien a ajouté Courses');
    expect(say(change({ action: 'deleted' }))).toBe('Fabien a supprimé Courses');
    expect(say(change({ entity: 'month', action: 'activated', label: null }))).toBe('Fabien a validé le plan');
    expect(say(change({ entity: 'month', action: 'closed', label: null }))).toBe('Fabien a clôturé le mois');
    expect(say(change({ cause: 'recompute', label: 'Électricité' }))).toBe('Répartition recalculée : Électricité');
    expect(say(change({ cause: 'propagation', label: 'Loyer' }))).toBe(
      "Fabien a modifié Loyer à partir d'un mois précédent",
    );
  });

  it('describes incomes', () => {
    expect(
      normalize(say(change({ entity: 'income', changes: [{ field: 'amountMinor', old: '200000', new: '210000' }] }))),
    ).toBe('Fabien a modifié son revenu de 2 000,00 € à 2 100,00 €');
    expect(say(change({ entity: 'income', action: 'confirmed' }))).toBe('Fabien a confirmé ses revenus');
  });

  it('names an anonymous former member', () => {
    expect(
      say(change({ actor: { membershipId: FABIEN.membershipId, displayName: null, formerMember: true }, action: 'created' })),
    ).toContain('Courses');
  });
});
