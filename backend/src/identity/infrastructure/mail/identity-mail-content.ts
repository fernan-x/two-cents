import type { IdentityMail } from '../../application/ports/mailer';
import type { Locale } from '../../domain/value-objects/locale';

export interface MailText {
  subject: string;
  /** Paragraphs, plain text (escaped when rendered to HTML). */
  paragraphs: string[];
  action?: { label: string; url: string };
}

const formatDate = (date: Date, locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(date);

const providerName = (p: 'apple' | 'google') =>
  p === 'apple' ? 'Apple' : 'Google';

/** Email texts per locale (FR-053). No amounts, budget names or entry labels (Principle III). */
export function identityMailText(
  mail: IdentityMail,
  locale: Locale,
  firstName: string,
): MailText {
  const fr = locale === 'fr';
  const hello = fr ? `Bonjour ${firstName},` : `Hi ${firstName},`;
  switch (mail.kind) {
    case 'confirm_email':
      return {
        subject: fr
          ? 'Confirmez votre adresse e-mail'
          : 'Confirm your email address',
        paragraphs: [
          hello,
          fr
            ? 'Confirmez votre adresse pour pouvoir inviter quelqu’un ou rejoindre un budget partagé. Ce lien est valable 24 heures.'
            : 'Confirm your address so you can invite someone or join a shared budget. This link is valid for 24 hours.',
        ],
        action: {
          label: fr ? 'Confirmer mon e-mail' : 'Confirm my email',
          url: mail.link,
        },
      };
    case 'reset_password':
      return {
        subject: fr
          ? 'Réinitialisez votre mot de passe'
          : 'Reset your password',
        paragraphs: [
          hello,
          fr
            ? 'Ce lien est valable 1 heure et ne fonctionne qu’une fois.'
            : 'This link is valid for 1 hour and works once.',
          fr
            ? 'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe ne change pas.'
            : 'If you didn’t ask for this, ignore this email: your password stays the same.',
        ],
        action: {
          label: fr
            ? 'Choisir un nouveau mot de passe'
            : 'Choose a new password',
          url: mail.link,
        },
      };
    case 'password_changed':
      return {
        subject: fr
          ? 'Votre mot de passe a été modifié'
          : 'Your password was changed',
        paragraphs: [
          hello,
          fr
            ? `Votre mot de passe a été modifié le ${formatDate(mail.at, locale)}. Tous vos autres appareils ont été déconnectés.`
            : `Your password was changed on ${formatDate(mail.at, locale)}. All your other devices were signed out.`,
          fr
            ? 'Si ce n’est pas vous, réinitialisez votre mot de passe tout de suite depuis l’app.'
            : 'If this wasn’t you, reset your password right away from the app.',
        ],
      };
    case 'link_account':
      return {
        subject: fr
          ? `Associer ${providerName(mail.provider)} à votre compte`
          : `Link ${providerName(mail.provider)} to your account`,
        paragraphs: [
          hello,
          fr
            ? `Ouvrez ce lien pour vous connecter aussi avec ${providerName(mail.provider)}. Il est valable 1 heure.`
            : `Open this link to also sign in with ${providerName(mail.provider)}. It is valid for 1 hour.`,
          fr
            ? 'Si ce n’est pas vous, ignorez cet e-mail.'
            : 'If this wasn’t you, ignore this email.',
        ],
        action: {
          label: fr ? 'Associer le compte' : 'Link the account',
          url: mail.link,
        },
      };
    case 'account_locked':
      return {
        subject: fr
          ? 'Connexion temporairement bloquée'
          : 'Sign-in temporarily locked',
        paragraphs: [
          hello,
          fr
            ? `Après plusieurs mots de passe incorrects, la connexion est bloquée jusqu’au ${formatDate(mail.until, locale)}.`
            : `After several wrong passwords, sign-in is locked until ${formatDate(mail.until, locale)}.`,
          fr
            ? 'Vous pouvez réinitialiser votre mot de passe depuis l’app pour débloquer votre compte tout de suite.'
            : 'You can reset your password from the app to unlock your account right away.',
        ],
      };
    case 'deletion_scheduled':
      return {
        subject: fr
          ? 'Suppression de votre compte programmée'
          : 'Your account deletion is scheduled',
        paragraphs: [
          hello,
          fr
            ? `Votre compte sera supprimé définitivement le ${formatDate(mail.scheduledAt, locale)}. D’ici là, vous pouvez annuler.`
            : `Your account will be permanently deleted on ${formatDate(mail.scheduledAt, locale)}. Until then, you can cancel.`,
        ],
        action: {
          label: fr ? 'Annuler la suppression' : 'Cancel the deletion',
          url: mail.link,
        },
      };
    case 'account_deleted':
      return {
        subject: fr
          ? 'Votre compte a été supprimé'
          : 'Your account was deleted',
        paragraphs: [
          hello,
          fr
            ? 'Votre compte Two Cents et vos données personnelles ont été supprimés. Merci d’avoir utilisé l’app.'
            : 'Your Two Cents account and personal data were deleted. Thank you for using the app.',
        ],
      };
  }
}
