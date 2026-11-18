import { mostUsedLines, normalizeLabel, stripBankNoise, suggestLine, type HintLabel, type MonthLineRef } from '../../src/domain/tracking/suggest';

describe('normalizeLabel', () => {
  it.each([
    ['LECLERC ', 'leclerc'],
    ['Leclerc', 'leclerc'],
    ['lèclerc', 'leclerc'],
    ['  Super   U  ', 'super u'],
    ['Café de la Gare', 'cafe de la gare'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeLabel(input)).toBe(expected);
  });
});

describe('stripBankNoise', () => {
  it.each([
    ['CB LECLERC 12/11', 'leclerc'],
    ['CARTE X1234 12/11 TOTAL ENERGIES', 'total energies'],
    ['PRLV SEPA FREE MOBILE', 'sepa free mobile'],
    ['VIR LOYER NOVEMBRE', 'loyer novembre'],
    ['Leclerc', 'leclerc'],
  ])('%s → %s', (input, expected) => {
    expect(stripBankNoise(input)).toBe(expected);
  });
});

const monthLines: MonthLineRef[] = [
  { id: 'l-courses', seriesId: 's-courses', group: 'recurring_shared', ownerMembershipId: null },
  { id: 'l-maison', seriesId: 's-maison', group: 'one_off_shared', ownerMembershipId: null },
  { id: 'l-carbu', seriesId: 's-carbu', group: 'recurring_shared', ownerMembershipId: null },
  { id: 'l-phone-a', seriesId: 's-phone-a', group: 'personal', ownerMembershipId: 'a' },
  { id: 'l-phone-b', seriesId: 's-phone-b', group: 'personal', ownerMembershipId: 'b' },
];

describe('suggestLine (FR-011)', () => {
  const labels: HintLabel[] = [
    { normalizedLabel: 'leclerc', seriesId: 's-courses', count: 3, lastUsedAt: '2026-11-01T10:00:00Z' },
    { normalizedLabel: 'leclerc', seriesId: 's-maison', count: 1, lastUsedAt: '2026-11-10T10:00:00Z' },
    { normalizedLabel: 'total', seriesId: 's-carbu', count: 2, lastUsedAt: '2026-11-02T10:00:00Z' },
    { normalizedLabel: 'total', seriesId: 's-maison', count: 2, lastUsedAt: '2026-11-09T10:00:00Z' },
    { normalizedLabel: 'ikea', seriesId: 's-gone', count: 5, lastUsedAt: '2026-11-09T10:00:00Z' },
  ];

  it('picks the most used series for that label, ties by most recent', () => {
    expect(suggestLine('LECLERC ', labels, monthLines)).toBe('l-courses');
    expect(suggestLine('Total', labels, monthLines)).toBe('l-maison');
  });

  it('suggests nothing for unknown labels or series absent from the month', () => {
    expect(suggestLine('Boulangerie', labels, monthLines)).toBeNull();
    expect(suggestLine('ikea', labels, monthLines)).toBeNull();
    expect(suggestLine('', labels, monthLines)).toBeNull();
  });
});

describe('mostUsedLines (FR-009)', () => {
  it('ranks by count, fills with other month lines, never offers other members personal lines', () => {
    const used = [
      { seriesId: 's-phone-b', count: 50 },
      { seriesId: 's-courses', count: 9 },
      { seriesId: 's-carbu', count: 4 },
      { seriesId: 's-gone', count: 3 },
      { seriesId: 's-phone-a', count: 2 },
    ];
    expect(mostUsedLines(used, monthLines, 'a')).toEqual(['l-courses', 'l-carbu', 'l-phone-a', 'l-maison']);
    expect(mostUsedLines(used, monthLines, 'a', 2)).toEqual(['l-courses', 'l-carbu']);
  });

  it('fills with month lines in order when there is no history, up to the limit', () => {
    expect(mostUsedLines([], monthLines, 'a', 3)).toEqual(['l-courses', 'l-maison', 'l-carbu']);
  });
});
