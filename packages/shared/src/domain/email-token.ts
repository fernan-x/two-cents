export type EmailTokenPurpose = 'confirm_email' | 'reset_password' | 'link_account' | 'cancel_deletion';

const HOUR_MS = 60 * 60 * 1000;

const LIFETIME_MS: Record<Exclude<EmailTokenPurpose, 'cancel_deletion'>, number> = {
  confirm_email: 24 * HOUR_MS,
  reset_password: HOUR_MS,
  link_account: HOUR_MS,
};

/** Expiry per purpose (data-model email_tokens): confirm 24 h, reset 1 h, link 1 h, cancel = deletion date. */
export function emailTokenExpiry(
  purpose: EmailTokenPurpose,
  now: Date,
  deletionScheduledAt?: Date,
): Date {
  if (purpose === 'cancel_deletion') {
    if (!deletionScheduledAt) throw new Error('cancel_deletion tokens need the scheduled deletion date');
    return deletionScheduledAt;
  }
  return new Date(now.getTime() + LIFETIME_MS[purpose]);
}

export function isEmailTokenValid(
  token: { usedAt: Date | null; supersededAt: Date | null; expiresAt: Date },
  now: Date,
): boolean {
  return token.usedAt === null && token.supersededAt === null && token.expiresAt.getTime() > now.getTime();
}
