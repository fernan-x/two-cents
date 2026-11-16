import {
  APPLE_CODE_EXCHANGER,
  APPLE_IDENTITY_VERIFIER,
  APPLE_NOTIFICATION_VERIFIER,
  GOOGLE_IDENTITY_VERIFIER,
  type AppleCodeExchanger,
  type ProviderIdentityVerifier,
  type ProviderClaims,
} from '../../src/identity/application/ports/providers';
import {
  BREACHED_PASSWORD_CHECKER,
  type BreachedPasswordChecker,
} from '../../src/identity/application/ports/security';
import type { PlainPassword } from '../../src/identity/domain/value-objects/plain-password';

/**
 * Provider tokens in e2e tests are plain strings: `<sub>|<email>|<relay?>|<given name?>`.
 * Anything not starting with "valid:" is rejected like a bad signature.
 */
export const appleToken = (sub: string, email: string | null, relay = false) =>
  `valid:${sub}|${email ?? ''}|${relay ? 'relay' : ''}|`;
export const googleToken = (sub: string, email: string, givenName = 'Fabien') =>
  `valid:${sub}|${email}||${givenName}`;

class FakeVerifier implements ProviderIdentityVerifier {
  verify(token: string): Promise<ProviderClaims | null> {
    if (!token.startsWith('valid:')) return Promise.resolve(null);
    const [sub, email, relay, givenName] = token
      .slice('valid:'.length)
      .split('|');
    return Promise.resolve({
      subject: sub,
      email: email || null,
      emailVerified: true,
      isPrivateRelay: relay === 'relay',
      givenName: givenName || null,
    });
  }
}

/** Apple notifications in e2e tests: `notif|<type>|<sub>`. */
class FakeAppleNotificationVerifier {
  verifyNotification(payload: string) {
    const [kind, type, subject] = payload.split('|');
    return Promise.resolve(
      kind === 'notif' ? { type: type as never, subject } : null,
    );
  }
}

class FakeAppleCodeExchanger implements AppleCodeExchanger {
  readonly revoked: string[] = [];
  exchange(code: string): Promise<string | null> {
    return Promise.resolve(`apple-refresh-for-${code}`);
  }
  revoke(refreshToken: string): Promise<void> {
    this.revoked.push(refreshToken);
    return Promise.resolve();
  }
}

class FakeBreachChecker implements BreachedPasswordChecker {
  isBreached(password: PlainPassword): Promise<boolean> {
    return Promise.resolve(
      ['password123', 'azertyuiop', 'motdepasse1'].includes(password.reveal()),
    );
  }
}

export function fakeProviders() {
  const apple = new FakeAppleCodeExchanger();
  return {
    apple,
    overrides: [
      { provide: APPLE_IDENTITY_VERIFIER, useValue: new FakeVerifier() },
      { provide: GOOGLE_IDENTITY_VERIFIER, useValue: new FakeVerifier() },
      { provide: APPLE_CODE_EXCHANGER, useValue: apple },
      {
        provide: APPLE_NOTIFICATION_VERIFIER,
        useValue: new FakeAppleNotificationVerifier(),
      },
      { provide: BREACHED_PASSWORD_CHECKER, useValue: new FakeBreachChecker() },
    ],
  };
}
