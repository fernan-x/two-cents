import type { Locale, OutboxPayloads } from '@two-cents/shared/contracts';
import type { MailText } from '../../../identity/infrastructure/mail/identity-mail-content';

const ROLE_LABEL = {
  fr: { admin: 'Admin', member: 'Membre', viewer: 'Lecteur' },
  en: { admin: 'Admin', member: 'Member', viewer: 'Viewer' },
} as const;

const formatDay = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));

/**
 * Budget emails (contracts/links-and-notifications.md). Budget and person names only: never an
 * amount (FR-042). French unless the recipient chose English (001 FR-053).
 */
export const budgetMail = {
  invitation(p: OutboxPayloads['invitation.sent'], locale: Locale): MailText {
    const fr = locale === 'fr';
    return {
      subject: fr
        ? `${p.inviterFirstName} vous invite à rejoindre « ${p.budgetName} »`
        : `${p.inviterFirstName} invited you to join “${p.budgetName}”`,
      paragraphs: [
        fr ? 'Bonjour,' : 'Hi,',
        fr
          ? `${p.inviterFirstName} vous invite à partager le budget « ${p.budgetName} » sur Two Cents, avec le rôle ${ROLE_LABEL.fr[p.role]}.`
          : `${p.inviterFirstName} invited you to share the budget “${p.budgetName}” on Two Cents, as ${ROLE_LABEL.en[p.role]}.`,
        fr
          ? `Si l’app n’est pas encore installée, installez-la puis saisissez ce code après votre inscription : ${p.code}`
          : `If you don’t have the app yet, install it, then enter this code after signing up: ${p.code}`,
        fr
          ? `Cette invitation est valable jusqu’au ${formatDay(p.expiresAt, locale)}.`
          : `This invitation is valid until ${formatDay(p.expiresAt, locale)}.`,
      ],
      action: {
        label: fr ? 'Voir l’invitation' : 'Open the invitation',
        url: p.link,
      },
    };
  },

  budgetDeleted(
    p: OutboxPayloads['budget.deleted'],
    locale: Locale,
    firstName: string,
  ): MailText {
    const fr = locale === 'fr';
    return {
      subject: fr
        ? `« ${p.budgetName} » a été supprimé`
        : `“${p.budgetName}” was deleted`,
      paragraphs: [
        fr ? `Bonjour ${firstName},` : `Hi ${firstName},`,
        fr
          ? `${p.deletedByFirstName} a supprimé le budget « ${p.budgetName} ». Vous n’y avez plus accès.`
          : `${p.deletedByFirstName} deleted the budget “${p.budgetName}”. You no longer have access to it.`,
        fr
          ? `Le propriétaire peut le restaurer jusqu’au ${formatDay(p.restorableUntil, locale)}.`
          : `The owner can restore it until ${formatDay(p.restorableUntil, locale)}.`,
      ],
    };
  },

  budgetRestored(
    p: OutboxPayloads['budget.restored'],
    locale: Locale,
    firstName: string,
  ): MailText {
    const fr = locale === 'fr';
    return {
      subject: fr
        ? `« ${p.budgetName} » a été restauré`
        : `“${p.budgetName}” was restored`,
      paragraphs: [
        fr ? `Bonjour ${firstName},` : `Hi ${firstName},`,
        fr
          ? `${p.restoredByFirstName} a restauré le budget « ${p.budgetName} ». Vous y avez de nouveau accès.`
          : `${p.restoredByFirstName} restored the budget “${p.budgetName}”. You can open it again.`,
      ],
    };
  },

  ownerChanged(
    p: OutboxPayloads['budget.owner_changed'],
    locale: Locale,
    firstName: string,
  ): MailText {
    const fr = locale === 'fr';
    return {
      subject: fr
        ? `Nouveau propriétaire pour « ${p.budgetName} »`
        : `New owner for “${p.budgetName}”`,
      paragraphs: [
        fr ? `Bonjour ${firstName},` : `Hi ${firstName},`,
        fr
          ? `L’ancien propriétaire a supprimé son compte. ${p.newOwnerFirstName} est maintenant propriétaire de « ${p.budgetName} ».`
          : `The previous owner deleted their account. ${p.newOwnerFirstName} now owns “${p.budgetName}”.`,
      ],
    };
  },
};

/** Push texts (French, contracts/links-and-notifications.md). */
export const budgetPush = {
  invitation: (p: OutboxPayloads['invitation.sent']) => ({
    title: `Invitation de ${p.inviterFirstName}`,
    body: `Rejoignez « ${p.budgetName} » sur Two Cents`,
    data: { url: `/i/${p.code}` },
  }),
  budgetDeleted: (p: OutboxPayloads['budget.deleted']) => ({
    title: 'Budget supprimé',
    body: `${p.deletedByFirstName} a supprimé « ${p.budgetName} »`,
  }),
  budgetRestored: (p: OutboxPayloads['budget.restored']) => ({
    title: 'Budget restauré',
    body: `${p.restoredByFirstName} a restauré « ${p.budgetName} »`,
    data: { url: `/budgets/${p.budgetId}` },
  }),
  memberRemoved: (p: OutboxPayloads['member.removed']) => ({
    title: 'Retiré d’un budget',
    body: `Vous avez été retiré de « ${p.budgetName} »`,
  }),
  ownerChanged: (p: OutboxPayloads['budget.owner_changed']) => ({
    title: 'Nouveau propriétaire',
    body: `${p.newOwnerFirstName} est maintenant propriétaire de « ${p.budgetName} »`,
    data: { url: `/budgets/${p.budgetId}` },
  }),
};
