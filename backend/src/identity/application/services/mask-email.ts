/** "fabien@example.com" → "f•••@example.com", shown on the link-account screen (contracts/api.md). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain ?? ''}`;
}
