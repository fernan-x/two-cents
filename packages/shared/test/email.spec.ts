import { normalizeEmail } from '../src/domain/email';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Fabien@Example.COM ')).toBe('fabien@example.com');
  });
  it('leaves an already normalized email unchanged', () => {
    expect(normalizeEmail('maelle@example.com')).toBe('maelle@example.com');
  });
  it('trims tabs and newlines', () => {
    expect(normalizeEmail('\tA@B.fr\n')).toBe('a@b.fr');
  });
});
