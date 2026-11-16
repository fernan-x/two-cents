import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthResult,
  DeviceInfo,
  Locale,
} from '@two-cents/shared/contracts';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  AuthIdentity,
  type IdentityProvider,
} from '../../domain/entities/auth-identity';
import { PendingLink } from '../../domain/entities/pending-link';
import { User } from '../../domain/entities/user';
import {
  AUTH_IDENTITY_REPOSITORY,
  type AuthIdentityRepository,
  PENDING_LINK_REPOSITORY,
  type PendingLinkRepository,
  SECURITY_EVENT_LOG,
  type SecurityEventLog,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/repositories';
import { Email } from '../../domain/value-objects/email';
import { FirstName } from '../../domain/value-objects/first-name';
import { toLocale } from '../../domain/value-objects/locale';
import {
  APPLE_CODE_EXCHANGER,
  APPLE_IDENTITY_VERIFIER,
  type AppleCodeExchanger,
  GOOGLE_IDENTITY_VERIFIER,
  type ProviderClaims,
  type ProviderIdentityVerifier,
} from '../ports/providers';
import {
  SECRET_ENCRYPTOR,
  SECRET_TOKEN_GENERATOR,
  type SecretEncryptor,
  type SecretTokenGenerator,
} from '../ports/security';
import { maskEmail } from '../services/mask-email';
import { SessionIssuer } from '../services/session-issuer';

export interface ProviderSignInInput {
  provider: IdentityProvider;
  token: string;
  /** Apple only: exchanged for a refresh token we can revoke on account deletion. */
  authorizationCode?: string;
  /** Apple sends the name only on the very first sign-in. */
  firstName?: string;
  locale: Locale;
  device: DeviceInfo;
}

/** US1: Sign in with Apple / Google — sign in, create the account, or ask for proof before linking (FR-007). */
@Injectable()
export class SignInWithProvider {
  constructor(
    @Inject(APPLE_IDENTITY_VERIFIER)
    private readonly appleVerifier: ProviderIdentityVerifier,
    @Inject(GOOGLE_IDENTITY_VERIFIER)
    private readonly googleVerifier: ProviderIdentityVerifier,
    @Inject(APPLE_CODE_EXCHANGER)
    private readonly appleCodes: AppleCodeExchanger,
    @Inject(SECRET_ENCRYPTOR) private readonly encryptor: SecretEncryptor,
    @Inject(SECRET_TOKEN_GENERATOR)
    private readonly secrets: SecretTokenGenerator,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUTH_IDENTITY_REPOSITORY)
    private readonly identities: AuthIdentityRepository,
    @Inject(PENDING_LINK_REPOSITORY)
    private readonly pendingLinks: PendingLinkRepository,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(
    input: ProviderSignInInput,
  ): Promise<AuthResult & { created: boolean }> {
    const verifier =
      input.provider === 'apple' ? this.appleVerifier : this.googleVerifier;
    const claims = await verifier.verify(input.token);
    if (!claims) throw new DomainError('INVALID_PROVIDER_TOKEN');

    const known = await this.identities.findByProviderSubject(
      input.provider,
      claims.subject,
    );
    if (known)
      return {
        ...(await this.signInExisting(known, claims, input)),
        created: false,
      };

    if (!claims.email) throw new DomainError('INVALID_PROVIDER_TOKEN');
    const email = Email.create(claims.email);
    const appleRefreshTokenEnc = await this.appleRefreshToken(input);

    const existing = await this.users.findByNormalizedEmail(email.normalized);
    if (existing) {
      const { token, hash } = this.secrets.generate();
      await this.pendingLinks.save(
        PendingLink.create({
          id: this.ids.next(),
          userId: existing.id,
          provider: input.provider,
          providerSubject: claims.subject,
          providerEmail: email.display,
          isPrivateRelay: claims.isPrivateRelay,
          appleRefreshTokenEnc,
          linkTokenHash: hash,
          now: this.clock.now(),
        }),
      );
      throw new DomainError('LINK_REQUIRED', {
        linkToken: token,
        emailHint: maskEmail(existing.email),
      });
    }

    return this.tx.run(async () => {
      const now = this.clock.now();
      const user = User.register({
        id: this.ids.next(),
        email,
        firstName: FirstName.create(
          this.pickFirstName(input.firstName, claims, email),
        ),
        locale: toLocale(input.locale),
        passwordHash: null,
        emailConfirmed: true,
        now,
      });
      await this.users.save(user);
      await this.identities.save(
        AuthIdentity.link({
          id: this.ids.next(),
          userId: user.id,
          provider: input.provider,
          providerSubject: claims.subject,
          providerEmail: email.display,
          isPrivateRelay: claims.isPrivateRelay,
          appleRefreshTokenEnc,
          now,
        }),
      );
      const { sessionId, ...result } = await this.sessions.open(
        user,
        input.provider,
        input.device,
      );
      await this.events.record({ type: 'signup', userId: user.id, sessionId });
      return { ...result, created: true };
    });
  }

  private async signInExisting(
    identity: AuthIdentity,
    claims: ProviderClaims,
    input: ProviderSignInInput,
  ) {
    return this.tx.run(async () => {
      const user = await this.users.findById(identity.userId);
      if (!user) throw new DomainError('INVALID_PROVIDER_TOKEN');
      identity.recordUse(claims.email, claims.isPrivateRelay, this.clock.now());
      await this.identities.save(identity);
      const { sessionId, ...result } = await this.sessions.open(
        user,
        input.provider,
        input.device,
      );
      await this.events.record({
        type: 'login_succeeded',
        userId: user.id,
        sessionId,
      });
      return result;
    });
  }

  private async appleRefreshToken(
    input: ProviderSignInInput,
  ): Promise<Buffer | null> {
    if (input.provider !== 'apple' || !input.authorizationCode) return null;
    const refreshToken = await this.appleCodes.exchange(
      input.authorizationCode,
    );
    return refreshToken ? this.encryptor.encrypt(refreshToken) : null;
  }

  private pickFirstName(
    provided: string | undefined,
    claims: ProviderClaims,
    email: Email,
  ): string {
    for (const candidate of [provided, claims.givenName]) {
      if (candidate && candidate.trim()) return candidate;
    }
    const local = email.display.split('@')[0].replace(/[._+-].*$/, '');
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Moi';
  }
}
