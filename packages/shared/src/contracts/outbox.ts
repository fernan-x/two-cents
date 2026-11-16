import type { Role } from './budgets';

/**
 * Payloads of the outbox messages (data-model "Outbox messages"). Never an amount (FR-042).
 * Recipient emails and names are kept only as long as the outbox retention allows (research R9).
 */
export interface OutboxPayloads {
  'invitation.sent': {
    invitationId: string;
    recipientEmail: string;
    inviterFirstName: string;
    budgetName: string;
    role: Exclude<Role, 'owner'>;
    link: string;
    /** Formatted `ABC-123`. */
    code: string;
    expiresAt: string;
  };
  'budget.deleted': {
    budgetId: string;
    budgetName: string;
    deletedByFirstName: string;
    restorableUntil: string;
    recipientUserIds: string[];
  };
  'budget.restored': {
    budgetId: string;
    budgetName: string;
    restoredByFirstName: string;
    recipientUserIds: string[];
  };
  'member.removed': {
    budgetName: string;
    recipientUserId: string;
  };
  'budget.owner_changed': {
    budgetId: string;
    budgetName: string;
    newOwnerFirstName: string;
    recipientUserIds: string[];
  };
}

export type OutboxTopic = keyof OutboxPayloads;
