import { Inject, Injectable } from '@nestjs/common';
import type {
  SettlementCreate,
  SettlementView,
} from '@two-cents/shared/contracts';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../budgets/domain/ports/repositories';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  SETTLEMENT_REPOSITORY,
  type SettlementRecord,
  type SettlementRepository,
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/ports/repositories';
import { TrackingViews } from '../services/tracking-views';
import { TxnWriter } from '../services/txn-writer';

/**
 * US6 (FR-031): "Marquer comme réglé" records an immutable settlement and brings the balance down.
 * Allowed on a Closed month: paying back after the month ends is normal (research R5).
 */
@Injectable()
export class Settlements {
  constructor(
    private readonly writer: TxnWriter,
    private readonly views: TrackingViews,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly txns: TransactionRepository,
    @Inject(SETTLEMENT_REPOSITORY)
    private readonly settlements: SettlementRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
  ) {}

  create(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    input: SettlementCreate,
  ): Promise<SettlementView> {
    return this.writer.run(
      auth,
      budgetId,
      monthStart,
      async (ctx) => {
        const [txns, existing, all] = await Promise.all([
          this.txns.listForMonth(ctx.month.id),
          this.settlements.listForMonth(ctx.month.id),
          this.memberships.listByBudget(budgetId),
        ]);
        const open = this.views
          .balances(ctx.budget, all, ctx.month, ctx.lines, txns, existing)
          .find(
            (b) =>
              b.from === input.fromMembershipId &&
              b.to === input.toMembershipId,
          );
        const amount = BigInt(input.amountMinor);
        if (!open || amount > open.amount)
          throw new DomainError('SETTLEMENT_EXCEEDS_BALANCE');
        const settlement: SettlementRecord = {
          id: ctx.newId(),
          budgetId,
          monthId: ctx.month.id,
          fromMembershipId: input.fromMembershipId,
          toMembershipId: input.toMembershipId,
          amountMinor: amount,
          createdAt: ctx.now,
          createdBy: ctx.me.id,
        };
        await this.settlements.insert(settlement);
        await ctx.record({
          entity: 'settlement',
          entityId: settlement.id,
          action: 'created',
          isPrivate: false,
          ownerMembershipId: null,
          labelSnapshot: null,
          changes: [
            { field: 'from', old: null, new: settlement.fromMembershipId },
            { field: 'to', old: null, new: settlement.toMembershipId },
            { field: 'amountMinor', old: null, new: amount.toString() },
          ],
        });
        return settlement;
      },
      async (_ctx, s) =>
        this.views.settlement(s, await this.views.refs(budgetId)),
      { allowClosed: true },
    );
  }
}
