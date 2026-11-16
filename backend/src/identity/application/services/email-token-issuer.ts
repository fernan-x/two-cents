import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  EmailToken,
  type EmailTokenPurpose,
} from '../../domain/entities/email-token';
import {
  EMAIL_TOKEN_REPOSITORY,
  type EmailTokenRepository,
} from '../../domain/ports/repositories';
import {
  SECRET_TOKEN_GENERATOR,
  type SecretTokenGenerator,
} from '../ports/security';

/** Issues a single-use email link token, superseding older ones of the same purpose (FR-010, FR-031). */
@Injectable()
export class EmailTokenIssuer {
  constructor(
    @Inject(EMAIL_TOKEN_REPOSITORY)
    private readonly tokens: EmailTokenRepository,
    @Inject(SECRET_TOKEN_GENERATOR)
    private readonly secrets: SecretTokenGenerator,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Returns the raw token, to put in the emailed link only. */
  async issue(
    userId: string,
    purpose: EmailTokenPurpose,
    extra: { deletionScheduledAt?: Date; pendingLinkId?: string } = {},
  ): Promise<string> {
    const now = this.clock.now();
    await this.tokens.supersedeAll(userId, purpose, now);
    const { token, hash } = this.secrets.generate();
    await this.tokens.save(
      EmailToken.issue({
        id: this.ids.next(),
        userId,
        purpose,
        tokenHash: hash,
        now,
        ...extra,
      }),
    );
    return token;
  }

  /** Finds and consumes a token, or throws TOKEN_INVALID. */
  async consume(
    token: string,
    purpose: EmailTokenPurpose,
  ): Promise<EmailToken> {
    const found = await this.tokens.findByHash(this.secrets.hash(token));
    if (!found) throw new DomainError('TOKEN_INVALID');
    found.consume(purpose, this.clock.now());
    await this.tokens.save(found);
    return found;
  }
}
