import { Inject, Injectable, Logger } from '@nestjs/common';
import { Mailer, MailError } from '@nestjs/mail';
import {
  NonRetryableMessageError,
  OnOutboxMessage,
  type OutboxHandlerContext,
} from '@nestjs/outbox';
import type { Locale, OutboxPayloads } from '@two-cents/shared/contracts';
import {
  PUSH_SENDER,
  type PushSender,
} from '../../../shared-kernel/application/ports';
import { IdentityMailable } from '../../../identity/infrastructure/mail/identity.mailable';
import type { MailText } from '../../../identity/infrastructure/mail/identity-mail-content';
import { USER_DIRECTORY, type UserDirectory } from '../../application/ports';
import {
  PUSH_DEVICE_REPOSITORY,
  type PushDeviceRepository,
} from '../../domain/ports/repositories';
import { budgetMail, budgetPush } from './budget-mail-content';

/**
 * Delivers the budget outbox messages (research R9): one consumer per channel, so an email is never
 * skipped because a push succeeded or failed. Pushes are best effort and never retried.
 */
@Injectable()
export class BudgetNotificationsHandler {
  private readonly logger = new Logger(BudgetNotificationsHandler.name);

  constructor(
    private readonly mailer: Mailer,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    @Inject(PUSH_DEVICE_REPOSITORY)
    private readonly devices: PushDeviceRepository,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
  ) {}

  @OnOutboxMessage('invitation.sent', { consumer: 'invitation-email' })
  async invitationEmail(
    p: OutboxPayloads['invitation.sent'],
    ctx: OutboxHandlerContext,
  ): Promise<void> {
    const user = await this.users.findByEmail(p.recipientEmail);
    const locale: Locale = user?.locale ?? 'fr';
    await this.mail(
      ctx,
      `${ctx.message.id}`,
      p.recipientEmail,
      locale,
      budgetMail.invitation(p, locale),
    );
  }

  @OnOutboxMessage('invitation.sent', { consumer: 'invitation-push' })
  async invitationPush(p: OutboxPayloads['invitation.sent']): Promise<void> {
    const user = await this.users.findByEmail(p.recipientEmail);
    if (user) await this.pushTo([user.id], budgetPush.invitation(p));
  }

  @OnOutboxMessage('budget.deleted', { consumer: 'budget-deleted-email' })
  async budgetDeletedEmail(
    p: OutboxPayloads['budget.deleted'],
    ctx: OutboxHandlerContext,
  ): Promise<void> {
    await this.mailEach(ctx, p.recipientUserIds, (locale, name) =>
      budgetMail.budgetDeleted(p, locale, name),
    );
  }

  @OnOutboxMessage('budget.deleted', { consumer: 'budget-deleted-push' })
  budgetDeletedPush(p: OutboxPayloads['budget.deleted']): Promise<void> {
    return this.pushTo(p.recipientUserIds, budgetPush.budgetDeleted(p));
  }

  @OnOutboxMessage('budget.restored', { consumer: 'budget-restored-email' })
  async budgetRestoredEmail(
    p: OutboxPayloads['budget.restored'],
    ctx: OutboxHandlerContext,
  ): Promise<void> {
    await this.mailEach(ctx, p.recipientUserIds, (locale, name) =>
      budgetMail.budgetRestored(p, locale, name),
    );
  }

  @OnOutboxMessage('budget.restored', { consumer: 'budget-restored-push' })
  budgetRestoredPush(p: OutboxPayloads['budget.restored']): Promise<void> {
    return this.pushTo(p.recipientUserIds, budgetPush.budgetRestored(p));
  }

  @OnOutboxMessage('member.removed', { consumer: 'member-removed-push' })
  memberRemovedPush(p: OutboxPayloads['member.removed']): Promise<void> {
    return this.pushTo([p.recipientUserId], budgetPush.memberRemoved(p));
  }

  @OnOutboxMessage('budget.owner_changed', { consumer: 'owner-changed-email' })
  async ownerChangedEmail(
    p: OutboxPayloads['budget.owner_changed'],
    ctx: OutboxHandlerContext,
  ): Promise<void> {
    await this.mailEach(ctx, p.recipientUserIds, (locale, name) =>
      budgetMail.ownerChanged(p, locale, name),
    );
  }

  @OnOutboxMessage('budget.owner_changed', { consumer: 'owner-changed-push' })
  ownerChangedPush(p: OutboxPayloads['budget.owner_changed']): Promise<void> {
    return this.pushTo(p.recipientUserIds, budgetPush.ownerChanged(p));
  }

  private async mailEach(
    ctx: OutboxHandlerContext,
    userIds: string[],
    text: (locale: Locale, firstName: string) => MailText,
  ): Promise<void> {
    const users = await this.users.findByIds(userIds);
    for (const user of users.values())
      await this.mail(
        ctx,
        `${ctx.message.id}:${user.id}`,
        user.emailNormalized,
        user.locale,
        text(user.locale, user.firstName),
      );
  }

  private async mail(
    ctx: OutboxHandlerContext,
    idempotencyKey: string,
    to: string,
    locale: Locale,
    data: MailText,
  ): Promise<void> {
    try {
      await this.mailer.send(IdentityMailable, {
        to,
        locale,
        data,
        idempotencyKey,
        retry: false,
      });
    } catch (error) {
      if (error instanceof MailError && error.permanent)
        throw new NonRetryableMessageError(
          `permanent mail failure (${ctx.message.topic})`,
          {
            cause: error,
          },
        );
      throw error;
    }
  }

  private async pushTo(
    userIds: string[],
    message: { title: string; body: string; data?: Record<string, string> },
  ): Promise<void> {
    try {
      const tokens = await this.devices.tokensForUsers(userIds);
      if (tokens.length > 0) await this.push.send([{ to: tokens, ...message }]);
    } catch (error) {
      this.logger.warn({ err: (error as Error).message }, 'push not delivered');
    }
  }
}
