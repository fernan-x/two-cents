import type { User } from '../../domain/entities/user';
import type { MailRecipient } from '../ports/mailer';

export const recipientOf = (user: User): MailRecipient => ({
  userId: user.id,
  email: user.email,
  locale: user.locale,
  firstName: user.firstName,
});
