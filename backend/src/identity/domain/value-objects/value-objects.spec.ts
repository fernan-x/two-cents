import { DomainError } from '../../../shared-kernel/domain/domain-error';
import { toCurrencyCode } from './currency-code';
import { Email } from './email';
import { FirstName } from './first-name';
import { toLocale } from './locale';
import { PlainPassword } from './plain-password';

describe('identity value objects', () => {
  it('Email keeps the display form and normalizes for comparison', () => {
    const email = Email.create('  Maelle@Example.com ');
    expect(email.display).toBe('Maelle@Example.com');
    expect(email.normalized).toBe('maelle@example.com');
    expect(email.equals(Email.create('maelle@example.com'))).toBe(true);
  });

  it('Email rejects malformed input', () => {
    expect(() => Email.create('not-an-email')).toThrow(DomainError);
  });

  it('FirstName stores NFC and rejects blanks', () => {
    expect(FirstName.create(' Maëlle ').value).toBe('Maëlle');
    expect(() => FirstName.create('   ')).toThrow(DomainError);
  });

  it('PlainPassword enforces the policy and never serializes', () => {
    expect(() => PlainPassword.create('short')).toThrow(
      expect.objectContaining({ code: 'PASSWORD_TOO_SHORT' }),
    );
    const password = PlainPassword.create('long enough password');
    expect(password.reveal()).toBe('long enough password');
    expect(String(password)).toBe('[redacted]');
    expect(() => JSON.stringify({ password })).toThrow();
  });

  it('Locale and currency accept only known values', () => {
    expect(toLocale('fr')).toBe('fr');
    expect(() => toLocale('de')).toThrow(DomainError);
    expect(toCurrencyCode('EUR')).toBe('EUR');
    expect(() => toCurrencyCode('eur')).toThrow(DomainError);
  });
});
