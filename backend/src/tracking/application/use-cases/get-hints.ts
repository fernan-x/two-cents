import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { TransactionHints } from '@two-cents/shared/contracts';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import { CLOCK, type Clock } from '../../../shared-kernel/application/ports';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/ports/repositories';

export const HINT_WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;

/**
 * US4 (research R6): what the app needs to suggest a line from a label and to rank the quick-add
 * chips, offline. Other members' private-line transactions are excluded (FR-012).
 */
@Injectable()
export class GetHints {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly txns: TransactionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    auth: AuthContext,
    budgetId: string,
  ): Promise<{ etag: string; hints: TransactionHints }> {
    const { membership } = await this.access.require(
      budgetId,
      auth.userId,
      'transactions.read',
    );
    const since = new Date(
      this.clock.now().getTime() - HINT_WINDOW_DAYS * DAY_MS,
    );
    const raw = await this.txns.hints(budgetId, since, membership.id);
    const etag = createHash('sha256')
      .update(
        `${raw.latestUpdate?.toISOString() ?? '-'}|${membership.id}|${since.toISOString().slice(0, 10)}`,
      )
      .digest('hex')
      .slice(0, 32);
    return {
      etag,
      hints: {
        windowDays: HINT_WINDOW_DAYS,
        labels: raw.labels.map((l) => ({
          normalizedLabel: l.normalizedLabel,
          seriesId: l.seriesId,
          count: l.count,
          lastUsedAt: l.lastUsedAt.toISOString(),
        })),
        mostUsed: raw.mostUsed,
        lastMethodByPayer: raw.lastMethods.map((m) => ({
          payer: m.payerMembershipId
            ? { kind: 'member' as const, membershipId: m.payerMembershipId }
            : { kind: 'joint' as const },
          paymentMethod: m.paymentMethod,
        })),
      },
    };
  }
}
