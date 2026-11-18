import { Inject, Injectable } from '@nestjs/common';
import {
  RECEIPT_MAX_BYTES,
  RECEIPTS_PER_TRANSACTION,
} from '@two-cents/shared/contracts';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import {
  LINE_REPOSITORY,
  type LineRepository,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../../planning/domain/ports/repositories';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  RECEIPT_STORE,
  type ReceiptStore,
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/ports/repositories';
import { hiddenFrom, personalOwner } from '../services/tracking-views';
import { TxnWriter } from '../services/txn-writer';

const JPEG_MAGIC = [0xff, 0xd8, 0xff];

/** US5 (research R10): receipt photos, ≤ 3 per transaction, ≤ 1 MB JPEG each. */
@Injectable()
export class Receipts {
  constructor(
    private readonly access: BudgetAccess,
    private readonly writer: TxnWriter,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly txns: TransactionRepository,
    @Inject(RECEIPT_STORE) private readonly store: ReceiptStore,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
  ) {}

  private async locate(budgetId: string, txnId: string) {
    const txn = await this.txns.findById(txnId);
    if (!txn || txn.budgetId !== budgetId) throw new DomainError('NOT_FOUND');
    const month = (await this.months.findById(txn.monthId))!;
    return { txn, month };
  }

  /** Idempotent on the client receipt id: true when created. */
  async put(
    auth: AuthContext,
    budgetId: string,
    txnId: string,
    receiptId: string,
    bytes: Buffer | undefined,
  ): Promise<boolean> {
    if (!Buffer.isBuffer(bytes) || !JPEG_MAGIC.every((b, i) => bytes[i] === b))
      throw new DomainError('VALIDATION_FAILED');
    if (bytes.length > RECEIPT_MAX_BYTES)
      throw new DomainError('RECEIPT_TOO_LARGE');
    await this.access.require(budgetId, auth.userId, 'transactions.write');
    const { month } = await this.locate(budgetId, txnId);
    return this.writer.run(auth, budgetId, month.periodStart, async (ctx) => {
      const txn = (await this.txns.findById(txnId))!;
      const owner = personalOwner(txn, ctx.lines);
      if (owner !== null && owner !== ctx.me.id)
        throw new DomainError('NOT_LINE_OWNER');
      const existing = await this.store.find(txnId, receiptId);
      if (existing) {
        if (!existing.bytes.equals(bytes)) throw new DomainError('ID_CONFLICT');
        return false;
      }
      if ((await this.store.count(txnId)) >= RECEIPTS_PER_TRANSACTION)
        throw new DomainError('TOO_MANY_RECEIPTS');
      await this.store.insert({
        id: receiptId,
        txnId,
        contentType: 'image/jpeg',
        bytes,
        createdAt: ctx.now,
        createdBy: ctx.me.id,
      });
      await this.writer.record(
        ctx,
        txn,
        'updated',
        { receipts: String(txn.receipts.length) },
        { receipts: String(txn.receipts.length + 1) },
      );
      return true;
    });
  }

  /** Hidden (404) from other members when the transaction is on a private line (FR-048). */
  async get(
    auth: AuthContext,
    budgetId: string,
    txnId: string,
    receiptId: string,
  ): Promise<Buffer> {
    const { membership } = await this.access.require(
      budgetId,
      auth.userId,
      'transactions.read',
    );
    const { txn, month } = await this.locate(budgetId, txnId);
    const lines = await this.lines.listForMonth(month.id);
    if (hiddenFrom(txn, lines, membership.id))
      throw new DomainError('NOT_FOUND');
    const receipt = await this.store.find(txnId, receiptId);
    if (!receipt) throw new DomainError('NOT_FOUND');
    return receipt.bytes;
  }

  async remove(
    auth: AuthContext,
    budgetId: string,
    txnId: string,
    receiptId: string,
  ): Promise<void> {
    await this.access.require(budgetId, auth.userId, 'transactions.write');
    const { month } = await this.locate(budgetId, txnId);
    await this.writer.run(auth, budgetId, month.periodStart, async (ctx) => {
      const txn = (await this.txns.findById(txnId))!;
      const owner = personalOwner(txn, ctx.lines);
      if (owner !== null && owner !== ctx.me.id)
        throw new DomainError('NOT_LINE_OWNER');
      if (!(await this.store.find(txnId, receiptId))) return;
      await this.store.delete(txnId, receiptId);
      await this.writer.record(
        ctx,
        txn,
        'updated',
        { receipts: String(txn.receipts.length) },
        { receipts: String(txn.receipts.length - 1) },
      );
    });
  }
}
