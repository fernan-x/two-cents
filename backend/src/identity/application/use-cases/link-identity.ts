import { Inject, Injectable } from '@nestjs/common';
import type { AuthResult, DeviceInfo } from '@two-cents/shared/contracts';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import { AuthIdentity } from '../../domain/entities/auth-identity';
import type { PendingLink } from '../../domain/entities/pending-link';
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
import { PlainPassword } from '../../domain/value-objects/plain-password';
import {
  IDENTITY_MAILER,
  type IdentityMailer,
  LINK_BUILDER,
  type LinkBuilder,
} from '../ports/mailer';
import {
  SECRET_TOKEN_GENERATOR,
  type SecretTokenGenerator,
} from '../ports/security';
import { EmailTokenIssuer } from '../services/email-token-issuer';
import { PasswordVerifier } from '../services/password-verifier';
import { recipientOf } from '../services/recipient';
import { SessionIssuer } from '../services/session-issuer';

/** Completes a pending link: attaches the provider identity and signs in (research R10). */
@Injectable()
export class IdentityLinker {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUTH_IDENTITY_REPOSITORY)
    private readonly identities: AuthIdentityRepository,
    @Inject(PENDING_LINK_REPOSITORY)
    private readonly pendingLinks: PendingLinkRepository,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionIssuer,
  ) {}

  async complete(link: PendingLink, device: DeviceInfo): Promise<AuthResult> {
    const user = await this.users.findById(link.userId);
    if (!user) throw new DomainError('LINK_EXPIRED');
    const now = this.clock.now();
    const p = link.toSnapshot();
    link.complete(now);
    await this.pendingLinks.save(link);
    await this.identities.save(
      AuthIdentity.link({
        id: this.ids.next(),
        userId: user.id,
        provider: p.provider,
        providerSubject: p.providerSubject,
        providerEmail: p.providerEmail,
        isPrivateRelay: p.isPrivateRelay,
        appleRefreshTokenEnc: p.appleRefreshTokenEnc,
        now,
      }),
    );
    await this.events.record({ type: 'identity_linked', userId: user.id });
    const { sessionId: _sessionId, ...result } = await this.sessions.open(
      user,
      p.provider,
      device,
    );
    return result;
  }
}

/** Proof of ownership with the existing account's password. */
@Injectable()
export class LinkIdentityWithPassword {
  constructor(
    @Inject(PENDING_LINK_REPOSITORY)
    private readonly pendingLinks: PendingLinkRepository,
    @Inject(SECRET_TOKEN_GENERATOR)
    private readonly secrets: SecretTokenGenerator,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly passwords: PasswordVerifier,
    private readonly linker: IdentityLinker,
  ) {}

  async execute(input: {
    linkToken: string;
    password: string;
    device: DeviceInfo;
  }): Promise<AuthResult> {
    const link = await this.pendingLinks.findByTokenHash(
      this.secrets.hash(input.linkToken),
    );
    if (!link) throw new DomainError('LINK_EXPIRED');
    link.assertOpen(this.clock.now());
    const user = await this.users.findById(link.userId);
    if (!user) throw new DomainError('LINK_EXPIRED');
    await this.passwords.verifyOrRecordFailure(
      user,
      PlainPassword.forVerification(input.password),
    );
    return this.tx.run(() => this.linker.complete(link, input.device));
  }
}

/** Proof of ownership by email: sends a 1 h single-use link to the existing account's address. */
@Injectable()
export class RequestLinkByEmail {
  constructor(
    @Inject(PENDING_LINK_REPOSITORY)
    private readonly pendingLinks: PendingLinkRepository,
    @Inject(SECRET_TOKEN_GENERATOR)
    private readonly secrets: SecretTokenGenerator,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(IDENTITY_MAILER) private readonly mailer: IdentityMailer,
    @Inject(LINK_BUILDER) private readonly links: LinkBuilder,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tokens: EmailTokenIssuer,
  ) {}

  async execute(input: { linkToken: string }): Promise<void> {
    const link = await this.pendingLinks.findByTokenHash(
      this.secrets.hash(input.linkToken),
    );
    if (!link) throw new DomainError('LINK_EXPIRED');
    link.assertOpen(this.clock.now());
    const user = await this.users.findById(link.userId);
    if (!user) throw new DomainError('LINK_EXPIRED');
    await this.tx.run(async () => {
      const token = await this.tokens.issue(user.id, 'link_account', {
        pendingLinkId: link.id,
      });
      this.mailer.send(recipientOf(user), {
        kind: 'link_account',
        link: this.links.build('link', token),
        provider: link.toSnapshot().provider,
      });
    });
  }
}

/** Opening the emailed link completes the pending link and signs in. */
@Injectable()
export class ConfirmLinkByEmail {
  constructor(
    @Inject(PENDING_LINK_REPOSITORY)
    private readonly pendingLinks: PendingLinkRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tokens: EmailTokenIssuer,
    private readonly linker: IdentityLinker,
  ) {}

  async execute(input: {
    token: string;
    device: DeviceInfo;
  }): Promise<AuthResult> {
    return this.tx.run(async () => {
      const token = await this.tokens.consume(input.token, 'link_account');
      const link = token.pendingLinkId
        ? await this.pendingLinks.findById(token.pendingLinkId)
        : null;
      if (!link) throw new DomainError('TOKEN_INVALID');
      link.assertOpen(this.clock.now(), true);
      return this.linker.complete(link, input.device);
    });
  }
}
