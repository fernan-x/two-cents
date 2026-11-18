import { Inject, Injectable } from '@nestjs/common';
import type {
  MonthTransactionsView,
  TransactionCreate,
  TransactionPatch,
  TransactionView,
} from '@two-cents/shared/contracts';
import { normalizeLabel, type PaymentMethod } from '@two-cents/shared/domain';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import type { Membership } from '../../../budgets/domain/entities/membership';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import type { MonthContext } from '../../../planning/application/services/month-writer';
import type { BudgetLine } from '../../../planning/domain/entities/budget-line';
import type { BudgetMonth } from '../../../planning/domain/entities/budget-month';
import {
  LINE_REPOSITORY,
  type LineRepository,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../../planning/domain/ports/repositories';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  assertTxnRules,
  normalizeTxn,
  type TxnOrigin,
  type TxnPartRecord,
  type TxnRecord,
  txnSnapshot,
} from '../../domain/entities/transaction';
import {
  SUGGESTION_STATS,
  type SuggestionStats,
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/ports/repositories';
import { personalOwner, TrackingViews } from '../services/tracking-views';
import { TxnWriter } from '../services/txn-writer';

type Create = TransactionCreate & { origin: TxnOrigin };
type PartInput = TransactionCreate['parts'][number];
type Patch = Omit<TransactionPatch, 'expectedVersion'> & {
  expectedVersion: number;
};

const SHARED_GROUPS = new Set(['recurring_shared', 'one_off_shared']);

const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
};

/**
 * Turns the parts a client sent into stored parts (FR-006, FR-016): a line of another month is
 * refused; a line that no longer exists becomes an unassigned, flagged part (offline sync never
 * loses a transaction); several unassigned parts are merged.
 */
export async function resolveParts(
  repo: TransactionRepository,
  lines: readonly BudgetLine[],
  input: readonly PartInput[],
  me: Membership,
  newId: () => string,
): Promise<TxnPartRecord[]> {
  const parts: TxnPartRecord[] = [];
  let unassigned: TxnPartRecord | null = null;
  for (const p of input) {
    const amount = BigInt(p.amountMinor);
    let lineId = p.lineId;
    let needsReview = false;
    if (lineId !== null) {
      const line = lines.find((l) => l.id === lineId);
      if (!line) {
        if (await repo.monthOfLine(lineId))
          throw new DomainError('LINE_NOT_IN_MONTH');
        lineId = null;
        needsReview = true;
      } else {
        if (p.subItemId && !line.subItems.some((s) => s.id === p.subItemId))
          throw new DomainError('LINE_NOT_IN_MONTH');
        if (line.group === 'personal' && line.ownerMembershipId !== me.id)
          throw new DomainError('NOT_LINE_OWNER');
      }
    }
    if (lineId === null) {
      if (unassigned) {
        unassigned.amountMinor += amount;
        unassigned.needsReview ||= needsReview;
      } else {
        unassigned = {
          id: newId(),
          lineId: null,
          subItemId: null,
          amountMinor: amount,
          needsReview,
          position: 0,
        };
        parts.push(unassigned);
      }
      continue;
    }
    parts.push({
      id: newId(),
      lineId,
      subItemId: p.subItemId ?? null,
      amountMinor: amount,
      needsReview: false,
      position: 0,
    });
  }
  return parts;
}

/** Shared iff on a shared line; for unassigned spending, the member's choice (FR-028). */
export function sharedFlag(
  parts: readonly TxnPartRecord[],
  lines: readonly BudgetLine[],
  requested: boolean | undefined,
): boolean {
  const assigned = parts.filter((p) => p.lineId !== null);
  if (assigned.length === 0) return requested ?? false;
  return assigned.some((p) =>
    SHARED_GROUPS.has(lines.find((l) => l.id === p.lineId)!.group),
  );
}

function defaultMethodFor(payer: string | null): PaymentMethod {
  return payer ? 'personal_card' : 'joint_card';
}

/** Equal for idempotent replays: the fields a client sends (research R3). */
function sameContent(a: TxnRecord, b: TxnRecord): boolean {
  const parts = (t: TxnRecord) =>
    t.parts.map((p) => `${p.lineId}|${p.subItemId}|${p.amountMinor}`).join(',');
  return (
    a.date === b.date &&
    a.amountMinor === b.amountMinor &&
    a.label === b.label &&
    a.payerMembershipId === b.payerMembershipId &&
    a.paymentMethod === b.paymentMethod &&
    a.isPlanned === b.isPlanned &&
    a.isShared === b.isShared &&
    a.note === b.note &&
    parts(a) === parts(b)
  );
}

/** Spec 004 US1, US2 ("Paid as planned"), US5: recording, listing, editing and deleting. */
@Injectable()
export class Transactions {
  constructor(
    private readonly access: BudgetAccess,
    private readonly writer: TxnWriter,
    private readonly views: TrackingViews,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly txns: TransactionRepository,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
    @Inject(SUGGESTION_STATS) private readonly stats: SuggestionStats,
  ) {}

  private async view(
    ctx: MonthContext,
    txn: TxnRecord,
  ): Promise<TransactionView> {
    const refs = await this.views.refs(ctx.budget.id);
    return this.views.transaction(txn, ctx.me, ctx.month, ctx.lines, refs);
  }

  private assertPayer(ctx: MonthContext, payer: string | null): void {
    if (payer && !ctx.members.some((m) => m.id === payer))
      throw new DomainError('UNKNOWN_MEMBER');
  }

  /** PUT …/transactions/:id — idempotent create by client id (research R3). */
  async put(
    auth: AuthContext,
    budgetId: string,
    id: string,
    input: Create,
  ): Promise<{ created: boolean; view: TransactionView }> {
    const { monthStart } = await this.writer.locate(auth, budgetId, input.date);
    try {
      return await this.writer.run(
        auth,
        budgetId,
        monthStart,
        async (ctx) => {
          const payer =
            input.payer.kind === 'member' ? input.payer.membershipId : null;
          this.assertPayer(ctx, payer);
          const parts = await resolveParts(
            this.txns,
            ctx.lines,
            input.parts,
            ctx.me,
            () => ctx.newId(),
          );
          const candidate = normalizeTxn({
            id,
            budgetId,
            monthId: ctx.month.id,
            date: input.date,
            amountMinor: BigInt(input.amountMinor),
            currency: ctx.budget.currency,
            isRefund: false,
            label: input.label,
            labelNormalized: '',
            payerMembershipId: payer,
            paymentMethod: input.paymentMethod ?? defaultMethodFor(payer),
            isPlanned: input.isPlanned ?? false,
            plannedSetByHand: input.isPlanned !== undefined,
            isShared: sharedFlag(parts, ctx.lines, input.isShared),
            note: input.note?.length ? input.note : null,
            origin: input.origin,
            recurringRuleId: null,
            scheduledDate: null,
            importKey: null,
            version: 1,
            createdAt: ctx.now,
            createdBy: ctx.me.id,
            updatedAt: ctx.now,
            updatedBy: ctx.me.id,
            parts,
            receipts: [],
          });
          const existing = await this.txns.findById(id);
          if (existing) {
            if (
              existing.budgetId !== budgetId ||
              !sameContent(existing, candidate)
            )
              throw new DomainError('ID_CONFLICT');
            return { created: false, txn: existing };
          }
          assertTxnRules(candidate);
          await this.txns.insert(candidate);
          await this.writer.record(
            ctx,
            candidate,
            'created',
            null,
            txnSnapshot(candidate),
          );
          if (input.suggestion)
            await this.stats.increment(
              budgetId,
              ctx.me.id,
              ctx.budget.today(ctx.now),
              input.suggestion,
            );
          return { created: true, txn: candidate };
        },
        async (ctx, r) => ({
          created: r.created,
          view: await this.view(ctx, r.txn),
        }),
      );
    } catch (e) {
      if (isUniqueViolation(e)) throw new DomainError('ID_CONFLICT');
      throw e;
    }
  }

  /** ETag path (research R4). */
  async revision(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
  ): Promise<string | null> {
    await this.access.require(budgetId, auth.userId, 'transactions.read');
    const revision = await this.months.revisionOf(budgetId, monthStart);
    return revision === null ? null : revision.toString();
  }

  async list(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
  ): Promise<MonthTransactionsView> {
    const { membership } = await this.access.require(
      budgetId,
      auth.userId,
      'transactions.read',
    );
    const month = await this.months.findByStart(budgetId, monthStart);
    if (!month) throw new DomainError('MONTH_NOT_FOUND');
    const [lines, txns, refs] = await Promise.all([
      this.lines.listForMonth(month.id),
      this.txns.listForMonth(month.id),
      this.views.refs(budgetId),
    ]);
    return {
      monthStart: month.periodStart,
      revision: month.revision.toString(),
      transactions: txns.map((t) =>
        this.views.transaction(t, membership, month, lines, refs),
      ),
    };
  }

  /** Finds a transaction of this budget and the start of its month, or 404. */
  private async locateTxn(
    budgetId: string,
    id: string,
  ): Promise<{ txn: TxnRecord; month: BudgetMonth } | null> {
    const txn = await this.txns.findById(id);
    if (!txn || txn.budgetId !== budgetId) return null;
    const month = (await this.months.findById(txn.monthId))!;
    return { txn, month };
  }

  private assertCanEdit(ctx: MonthContext, txn: TxnRecord): void {
    const owner = personalOwner(txn, ctx.lines);
    if (owner !== null && owner !== ctx.me.id)
      throw new DomainError('NOT_LINE_OWNER');
  }

  private async assertVersion(
    ctx: MonthContext,
    txn: TxnRecord,
    expected: number,
  ): Promise<void> {
    if (txn.version !== expected)
      throw new DomainError('STALE_STATE', {
        current: await this.view(ctx, txn),
      });
  }

  /** PATCH …/transactions/:id (US5). Changing the date may move it to another open month. */
  async patch(
    auth: AuthContext,
    budgetId: string,
    id: string,
    input: Patch,
  ): Promise<TransactionView> {
    await this.access.require(budgetId, auth.userId, 'transactions.write');
    const found = await this.locateTxn(budgetId, id);
    if (!found) throw new DomainError('NOT_FOUND');
    return this.writer.run(
      auth,
      budgetId,
      found.month.periodStart,
      async (ctx) => {
        const txn = await this.txns.findById(id);
        if (!txn || txn.monthId !== ctx.month.id)
          throw new DomainError('STALE_STATE');
        await this.assertVersion(ctx, txn, input.expectedVersion);
        this.assertCanEdit(ctx, txn);

        const date = input.date ?? txn.date;
        const targetStart = ctx.budget.monthOf(date).start;
        let target = ctx.month;
        let targetLines: readonly BudgetLine[] = ctx.lines;
        if (targetStart !== ctx.month.periodStart) {
          target = await this.writer.lockOther(budgetId, targetStart);
          targetLines = await this.lines.listForMonth(target.id);
        }

        const payer =
          input.payer === undefined
            ? txn.payerMembershipId
            : input.payer.kind === 'member'
              ? input.payer.membershipId
              : null;
        this.assertPayer(ctx, payer);
        let parts: TxnPartRecord[];
        if (input.parts !== undefined) {
          parts = await resolveParts(
            this.txns,
            targetLines,
            input.parts,
            ctx.me,
            () => ctx.newId(),
          );
        } else if (target !== ctx.month) {
          // Same series in the new month, else unassigned and flagged (spec edge case).
          parts = txn.parts.map((p) => {
            const old = ctx.lines.find((l) => l.id === p.lineId);
            const next =
              old && targetLines.find((l) => l.seriesId === old.seriesId);
            return next
              ? { ...p, id: ctx.newId(), lineId: next.id, subItemId: null }
              : {
                  ...p,
                  id: ctx.newId(),
                  lineId: null,
                  subItemId: null,
                  needsReview: p.lineId !== null || p.needsReview,
                };
          });
        } else {
          parts = txn.parts;
        }
        if (
          input.amountMinor !== undefined &&
          input.parts === undefined &&
          parts.length === 1
        )
          parts = [{ ...parts[0], amountMinor: BigInt(input.amountMinor) }];

        const before = txnSnapshot(txn);
        const updated = normalizeTxn({
          ...txn,
          monthId: target.id,
          date,
          amountMinor:
            input.amountMinor !== undefined
              ? BigInt(input.amountMinor)
              : txn.amountMinor,
          label: input.label ?? txn.label,
          payerMembershipId: payer,
          paymentMethod:
            input.paymentMethod ??
            (input.payer !== undefined
              ? defaultMethodFor(payer)
              : txn.paymentMethod),
          isPlanned: input.isPlanned ?? txn.isPlanned,
          plannedSetByHand:
            txn.plannedSetByHand || input.isPlanned !== undefined,
          isShared: sharedFlag(
            parts,
            targetLines,
            input.isShared ?? txn.isShared,
          ),
          note:
            input.note === undefined
              ? txn.note
              : input.note?.length
                ? input.note
                : null,
          version: txn.version + 1,
          updatedAt: ctx.now,
          updatedBy: ctx.me.id,
          parts,
        });
        assertTxnRules(updated);
        await this.txns.update(updated);
        await this.writer.record(
          ctx,
          updated,
          'updated',
          before,
          txnSnapshot(updated),
        );
        if (target !== ctx.month) {
          await this.writer.record(
            ctx,
            updated,
            'updated',
            before,
            txnSnapshot(updated),
            {
              month: target,
            },
          );
          await this.writer.bump(target);
        }
        return { ...updated, receipts: txn.receipts };
      },
      async (ctx, txn) => {
        const month = (await this.months.findById(txn.monthId))!;
        const lines =
          month.id === ctx.month.id
            ? ctx.lines
            : await this.lines.listForMonth(month.id);
        const refs = await this.views.refs(budgetId);
        return this.views.transaction(txn, ctx.me, month, lines, refs);
      },
    );
  }

  /** DELETE …/transactions/:id — idempotent for offline retries (research R13). */
  async remove(
    auth: AuthContext,
    budgetId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.access.require(budgetId, auth.userId, 'transactions.write');
    const found = await this.locateTxn(budgetId, id);
    if (!found) return;
    await this.writer.run(
      auth,
      budgetId,
      found.month.periodStart,
      async (ctx) => {
        const txn = await this.txns.findById(id);
        if (!txn) return;
        await this.assertVersion(ctx, txn, expectedVersion);
        this.assertCanEdit(ctx, txn);
        await this.txns.delete(id);
        await this.writer.record(ctx, txn, 'deleted', txnSnapshot(txn), null);
      },
    );
  }

  /** POST …/lines/:lineId/paid-as-planned (FR-025): one ordinary transaction, idempotent on `txnId`. */
  async paidAsPlanned(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    lineId: string,
    txnId: string,
  ): Promise<{ created: boolean; view: TransactionView }> {
    return this.writer.run(
      auth,
      budgetId,
      monthStart,
      async (ctx) => {
        const existing = await this.txns.findById(txnId);
        if (existing) {
          const sameLine = existing.parts.some((p) => p.lineId === lineId);
          if (
            existing.budgetId !== budgetId ||
            existing.origin !== 'paid_as_planned' ||
            !sameLine
          )
            throw new DomainError('ID_CONFLICT');
          return { created: false, txn: existing };
        }
        const line = ctx.lines.find((l) => l.id === lineId);
        if (!line) throw new DomainError('NOT_FOUND');
        if (line.group === 'personal' && line.ownerMembershipId !== ctx.me.id)
          throw new DomainError('NOT_LINE_OWNER');
        const today = ctx.budget.today(ctx.now);
        const { periodStart, periodEnd } = ctx.month;
        const date =
          today < periodStart
            ? periodStart
            : today > periodEnd
              ? periodEnd
              : today;
        const personal = line.group === 'personal';
        const txn = normalizeTxn({
          id: txnId,
          budgetId,
          monthId: ctx.month.id,
          date,
          amountMinor: line.totalMinor,
          currency: ctx.budget.currency,
          isRefund: false,
          label: line.label,
          labelNormalized: normalizeLabel(line.label),
          payerMembershipId: personal ? line.ownerMembershipId : null,
          paymentMethod: personal ? 'personal_card' : 'transfer',
          isPlanned: true,
          plannedSetByHand: true,
          isShared: !personal,
          note: null,
          origin: 'paid_as_planned',
          recurringRuleId: null,
          scheduledDate: null,
          importKey: null,
          version: 1,
          createdAt: ctx.now,
          createdBy: ctx.me.id,
          updatedAt: ctx.now,
          updatedBy: ctx.me.id,
          parts: [
            {
              id: ctx.newId(),
              lineId,
              subItemId: null,
              amountMinor: line.totalMinor,
              needsReview: false,
              position: 0,
            },
          ],
          receipts: [],
        });
        assertTxnRules(txn);
        await this.txns.insert(txn);
        await this.writer.record(ctx, txn, 'created', null, txnSnapshot(txn), {
          cause: 'paid_as_planned',
        });
        return { created: true, txn };
      },
      async (ctx, r) => ({
        created: r.created,
        view: await this.view(ctx, r.txn),
      }),
    );
  }
}
