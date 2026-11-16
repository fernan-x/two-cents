import { Inject, Injectable } from '@nestjs/common';
import type { User } from '../../domain/entities/user';
import {
  IDENTITY_MAILER,
  type IdentityMailer,
  LINK_BUILDER,
  type LinkBuilder,
} from '../ports/mailer';
import { EmailTokenIssuer } from './email-token-issuer';
import { recipientOf } from './recipient';

/** Issues a 24 h confirmation token and emails the link (US3, FR-010). */
@Injectable()
export class EmailConfirmationSender {
  constructor(
    private readonly tokens: EmailTokenIssuer,
    @Inject(IDENTITY_MAILER) private readonly mailer: IdentityMailer,
    @Inject(LINK_BUILDER) private readonly links: LinkBuilder,
  ) {}

  async send(user: User): Promise<void> {
    const token = await this.tokens.issue(user.id, 'confirm_email');
    this.mailer.send(recipientOf(user), {
      kind: 'confirm_email',
      link: this.links.build('confirm', token),
    });
  }
}
