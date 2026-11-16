import { normalizeInviteCode } from '@two-cents/shared/domain';

import { secureStorage } from '@/auth/secure-storage';

let memory: string | null = null;
let justSignedUp = false;

/**
 * FR-015: an invitation opened while signed out survives sign-up or sign-in, so the person lands on
 * the invitation without reopening the link. Kept in memory and in secure storage meanwhile.
 */
export const pendingInvite = {
  async save(code: string): Promise<void> {
    const normalized = normalizeInviteCode(code);
    if (!normalized) return;
    memory = normalized;
    await secureStorage.setPendingInvite(normalized);
  },
  /** The held code, if any (memory first, then storage after an app restart). */
  async peek(): Promise<string | null> {
    if (memory) return memory;
    memory = await secureStorage.getPendingInvite();
    return memory;
  },
  async clear(): Promise<void> {
    memory = null;
    await secureStorage.clearPendingInvite();
  },
};

/** FR-016a: set by the sign-up flows, read once to show "Vous avez un code d'invitation ?". */
export const signUpPrompt = {
  mark(): void {
    justSignedUp = true;
  },
  consume(): boolean {
    const value = justSignedUp;
    justSignedUp = false;
    return value;
  },
};
