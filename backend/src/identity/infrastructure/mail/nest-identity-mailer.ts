import { Inject, Injectable, Logger } from '@nestjs/common';
import { Mailer } from '@nestjs/mail';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import {
  SECURITY_EVENT_LOG,
  type SecurityEventLog,
} from '../../domain/ports/repositories';
import type {
  IdentityMail,
  IdentityMailer,
  MailRecipient,
} from '../../application/ports/mailer';
import { IdentityMailable } from './identity.mailable';
import { identityMailText } from './identity-mail-content';

/**
 * Sends directly (not through the outbox) after the transaction commits, because these emails carry
 * secret single-use links (research R14). Failures are recorded, never thrown.
 */
@Injectable()
export class NestIdentityMailer implements IdentityMailer {
  private readonly logger = new Logger(NestIdentityMailer.name);

  constructor(
    private readonly mailer: Mailer,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
  ) {}

  send(to: MailRecipient, mail: IdentityMail): void {
    this.tx.afterCommit(async () => {
      try {
        await this.mailer.send(IdentityMailable, {
          to: { name: to.firstName, address: to.email },
          locale: to.locale,
          data: identityMailText(mail, to.locale, to.firstName),
        });
      } catch (error) {
        this.logger.warn(
          { err: error, kind: mail.kind },
          'identity email not delivered',
        );
        await this.events.record({
          type: 'email_delivery_failed',
          userId: mail.kind === 'account_deleted' ? null : to.userId,
        });
      }
    });
  }
}
