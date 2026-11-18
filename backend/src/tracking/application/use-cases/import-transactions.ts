import { Inject, Injectable } from '@nestjs/common';
import {
  CsvMapping,
  type TransactionImportRequest,
  type TransactionImportResult,
} from '@two-cents/shared/contracts';
import { can, findDuplicates } from '@two-cents/shared/domain';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import { ChangeMonthStatus } from '../../../planning/application/use-cases/status-and-history';
import type { BudgetMonth } from '../../../planning/domain/entities/budget-month';
import {
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../../planning/domain/ports/repositories';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  assertTxnRules,
  normalizeTxn,
  txnSnapshot,
} from '../../domain/entities/transaction';
import {
  CSV_MAPPING_REPOSITORY,
  type CsvMappingRepository,
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/ports/repositories';
import { TxnWriter } from '../services/txn-writer';
import { resolveParts, sharedFlag } from './transactions';

type Request = Omit<TransactionImportRequest, 'rows'> & {
  rows: (TransactionImportRequest['rows'][number] & { isShared?: boolean })[];
};

/**
 * US9 (FR-039–FR-043, research R11): the device parsed the bank CSV; this checks duplicates and
 * months (dry run), then saves every included row in one transaction (all or nothing).
 */
@Injectable()
export class ImportTransactions {
  constructor(
    private readonly access: BudgetAccess,
    private readonly writer: TxnWriter,
    private readonly status: ChangeMonthStatus,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly txns: TransactionRepository,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(CSV_MAPPING_REPOSITORY)
    private readonly mappings: CsvMappingRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async getMapping(
    auth: AuthContext,
    budgetId: string,
    fingerprint: string,
  ): Promise<CsvMapping> {
    await this.access.require(budgetId, auth.userId, 'transactions.read');
    const found = await this.mappings.find(budgetId, fingerprint);
    if (!found) throw new DomainError('NOT_FOUND');
    return CsvMapping.parse(found);
  }

  async putMapping(
    auth: AuthContext,
    budgetId: string,
    fingerprint: string,
    mapping: CsvMapping,
  ): Promise<CsvMapping> {
    const { membership } = await this.access.require(
      budgetId,
      auth.userId,
      'transactions.write',
    );
    await this.mappings.upsert(
      budgetId,
      fingerprint,
      mapping,
      membership.id,
      this.clock.now(),
      this.ids.next(),
    );
    return mapping;
  }

  async execute(
    auth: AuthContext,
    budgetId: string,
    input: Request,
  ): Promise<TransactionImportResult> {
    const { budget, membership } = await this.access.require(
      budgetId,
      auth.userId,
      'transactions.write',
    );
    const payer = input.account.kind === 'member' ? membership.id : null;
    const payerKey = payer ? `member:${payer}` : 'joint';
    const included = input.rows.filter((r) => r.include);

    // Months of the rows and their status.
    const monthByStart = new Map<string, BudgetMonth | null>();
    const startOf = (date: string) => budget.monthOf(date).start;
    for (const r of included) {
      const start = startOf(r.date);
      if (!monthByStart.has(start))
        monthByStart.set(start, await this.months.findByStart(budgetId, start));
    }
    const existing = [];
    for (const month of monthByStart.values())
      if (month)
        for (const t of await this.txns.listForMonth(month.id))
          existing.push({
            id: t.id,
            date: t.date,
            amount: t.amountMinor,
            payerKey: t.payerMembershipId
              ? `member:${t.payerMembershipId}`
              : 'joint',
            importKey: t.importKey,
          });
    for (const t of await this.txns.findByImportKeys(
      budgetId,
      included.map((r) => r.importKey),
    ))
      if (!existing.some((e) => e.id === t.id))
        existing.push({
          id: t.id,
          date: t.date,
          amount: t.amountMinor,
          payerKey: t.payerMembershipId
            ? `member:${t.payerMembershipId}`
            : 'joint',
          importKey: t.importKey,
        });
    const dupes = findDuplicates(
      input.rows.map((r) => ({
        rowId: r.rowId,
        date: r.date,
        amount: BigInt(r.amountMinor),
        payerKey,
        importKey: r.importKey,
      })),
      existing,
    );
    const statusOf = (date: string): 'open' | 'closed' | 'missing' => {
      const m = monthByStart.get(startOf(date));
      return m === undefined
        ? 'open'
        : !m
          ? 'missing'
          : m.status === 'closed'
            ? 'closed'
            : 'open';
    };
    const rows = input.rows.map((r) => ({
      rowId: r.rowId,
      duplicateOf: dupes.get(r.rowId)!.duplicateOf,
      alreadyImported: dupes.get(r.rowId)!.alreadyImported,
      monthStatus: r.include ? statusOf(r.date) : ('open' as const),
      error: null,
    }));
    if (input.dryRun) return { rows };

    if (included.some((r) => statusOf(r.date) === 'missing'))
      throw new DomainError('MONTH_NOT_FOUND');
    const closedRows = included.filter((r) => statusOf(r.date) === 'closed');
    if (closedRows.length && !input.closedMonthAction)
      throw new DomainError('VALIDATION_FAILED');
    if (
      closedRows.length &&
      input.closedMonthAction === 'reopen' &&
      !can(membership.role, 'months.reopen')
    )
      throw new DomainError('FORBIDDEN');

    return this.tx.run(async () => {
      const now = this.clock.now();
      const today = budget.today(now);
      const toSave = included
        .filter((r) => !dupes.get(r.rowId)!.alreadyImported)
        .filter(
          (r) =>
            statusOf(r.date) !== 'closed' || input.closedMonthAction !== 'skip',
        )
        .map((r) =>
          statusOf(r.date) === 'closed' &&
          input.closedMonthAction === 'move_to_current'
            ? { ...r, date: today }
            : r,
        );
      if (input.closedMonthAction === 'reopen')
        for (const start of new Set(closedRows.map((r) => startOf(r.date))))
          await this.status.execute(auth, budgetId, start, 'reopen');

      const groups = new Map<string, typeof toSave>();
      for (const r of toSave)
        groups.set(startOf(r.date), [
          ...(groups.get(startOf(r.date)) ?? []),
          r,
        ]);
      let created = 0;
      for (const [start, group] of groups) {
        created += await this.writer.run(auth, budgetId, start, async (ctx) => {
          let n = 0;
          for (const r of group) {
            const parts = await resolveParts(
              this.txns,
              ctx.lines,
              r.parts,
              ctx.me,
              () => ctx.newId(),
            );
            const txn = normalizeTxn({
              id: r.rowId,
              budgetId,
              monthId: ctx.month.id,
              date: r.date,
              amountMinor: BigInt(r.amountMinor),
              currency: budget.currency,
              isRefund: false,
              label: r.label,
              labelNormalized: '',
              payerMembershipId: payer,
              paymentMethod: payer ? 'personal_card' : 'joint_card',
              isPlanned: r.isPlanned,
              plannedSetByHand: true,
              isShared: sharedFlag(parts, ctx.lines, r.isShared),
              note: null,
              origin: 'import',
              recurringRuleId: null,
              scheduledDate: null,
              importKey: r.importKey,
              version: 1,
              createdAt: now,
              createdBy: ctx.me.id,
              updatedAt: now,
              updatedBy: ctx.me.id,
              parts,
              receipts: [],
            });
            assertTxnRules(txn);
            await this.txns.insert(txn);
            await this.writer.record(
              ctx,
              txn,
              'created',
              null,
              txnSnapshot(txn),
              { cause: 'import' },
            );
            n += 1;
          }
          return n;
        });
      }
      return { rows, created };
    });
  }
}
