import { Injectable } from '@nestjs/common';
import type { PaymentMethod } from '@two-cents/shared/domain';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import {
  budgetLines,
  txnParts,
  txnReceipts,
  txns,
} from '../../../shared-kernel/infrastructure/db/schema';
import type { TxnRecord } from '../../domain/entities/transaction';
import type { TransactionRepository } from '../../domain/ports/repositories';

type Row = typeof txns.$inferSelect;
type PartRow = typeof txnParts.$inferSelect;

const columns = (t: TxnRecord): typeof txns.$inferInsert => {
  const { parts: _p, receipts: _r, ...row } = t;
  return row;
};

@Injectable()
export class DrizzleTransactionRepository implements TransactionRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  private async hydrate(rows: Row[]): Promise<TxnRecord[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [parts, receipts] = await Promise.all([
      this.db
        .executor()
        .select()
        .from(txnParts)
        .where(inArray(txnParts.txnId, ids))
        .orderBy(asc(txnParts.position)),
      // Never the bytes (research R10).
      this.db
        .executor()
        .select({
          id: txnReceipts.id,
          txnId: txnReceipts.txnId,
          createdAt: txnReceipts.createdAt,
        })
        .from(txnReceipts)
        .where(inArray(txnReceipts.txnId, ids))
        .orderBy(asc(txnReceipts.createdAt)),
    ]);
    const partsBy = new Map<string, PartRow[]>();
    for (const p of parts)
      partsBy.set(p.txnId, [...(partsBy.get(p.txnId) ?? []), p]);
    return rows.map((r) => ({
      ...r,
      parts: (partsBy.get(r.id) ?? []).map((p) => ({
        id: p.id,
        lineId: p.lineId,
        subItemId: p.subItemId,
        amountMinor: p.amountMinor,
        needsReview: p.needsReview,
        position: p.position,
      })),
      receipts: receipts
        .filter((x) => x.txnId === r.id)
        .map((x) => ({ id: x.id, createdAt: x.createdAt })),
    }));
  }

  async findById(id: string): Promise<TxnRecord | null> {
    const rows = await this.db
      .executor()
      .select()
      .from(txns)
      .where(eq(txns.id, id))
      .limit(1);
    return (await this.hydrate(rows))[0] ?? null;
  }

  async listForMonth(monthId: string): Promise<TxnRecord[]> {
    const rows = await this.db
      .executor()
      .select()
      .from(txns)
      .where(eq(txns.monthId, monthId))
      .orderBy(desc(txns.date), desc(txns.createdAt), desc(txns.id));
    return this.hydrate(rows);
  }

  async findByImportKeys(
    budgetId: string,
    keys: readonly string[],
  ): Promise<TxnRecord[]> {
    if (keys.length === 0) return [];
    const rows = await this.db
      .executor()
      .select()
      .from(txns)
      .where(
        and(eq(txns.budgetId, budgetId), inArray(txns.importKey, [...keys])),
      );
    return this.hydrate(rows);
  }

  private async insertParts(t: TxnRecord): Promise<void> {
    if (t.parts.length === 0) return;
    await this.db
      .executor()
      .insert(txnParts)
      .values(t.parts.map((p) => ({ ...p, txnId: t.id })));
  }

  async insert(t: TxnRecord): Promise<void> {
    await this.db.executor().insert(txns).values(columns(t));
    await this.insertParts(t);
  }

  async insertRecurring(t: TxnRecord): Promise<boolean> {
    const inserted = await this.db
      .executor()
      .insert(txns)
      .values(columns(t))
      .onConflictDoNothing()
      .returning({ id: txns.id });
    if (inserted.length === 0) return false;
    await this.insertParts(t);
    return true;
  }

  async update(t: TxnRecord): Promise<void> {
    const { id: _id, createdAt: _c, createdBy: _cb, ...row } = columns(t);
    await this.db.executor().update(txns).set(row).where(eq(txns.id, t.id));
    await this.db.executor().delete(txnParts).where(eq(txnParts.txnId, t.id));
    await this.insertParts(t);
  }

  async delete(id: string): Promise<void> {
    await this.db.executor().delete(txns).where(eq(txns.id, id));
  }

  async unassignLine(lineId: string): Promise<string[]> {
    const touched = await this.db
      .executor()
      .update(txnParts)
      .set({ lineId: null, subItemId: null, needsReview: true })
      .where(eq(txnParts.lineId, lineId))
      .returning({ txnId: txnParts.txnId });
    if (touched.length === 0) return [];
    const months = await this.db
      .executor()
      .selectDistinct({ monthId: txns.monthId })
      .from(txns)
      .where(
        inArray(
          txns.id,
          touched.map((t) => t.txnId),
        ),
      );
    return months.map((m) => m.monthId);
  }

  async monthOfLine(lineId: string): Promise<string | null> {
    const [row] = await this.db
      .executor()
      .select({ monthId: budgetLines.monthId })
      .from(budgetLines)
      .where(eq(budgetLines.id, lineId))
      .limit(1);
    return row?.monthId ?? null;
  }

  async hints(budgetId: string, since: Date, viewer: string) {
    const exec = this.db.executor();
    // Parts on other members' private lines never feed anyone else's hints (FR-012).
    const visible = sql`(NOT bl.is_private OR bl.owner_membership_id = ${viewer})`;
    const labels = await exec.execute<{
      normalized_label: string;
      series_id: string;
      count: string;
      last_used_at: Date;
    }>(sql`
      SELECT t.label_normalized AS normalized_label, bl.series_id, count(*) AS count, max(t.created_at) AS last_used_at
      FROM txn t JOIN txn_part p ON p.txn_id = t.id JOIN budget_line bl ON bl.id = p.line_id
      WHERE t.budget_id = ${budgetId} AND t.created_at >= ${since} AND ${visible}
      GROUP BY t.label_normalized, bl.series_id`);
    const mostUsed = await exec.execute<{
      series_id: string;
      count: string;
    }>(sql`
      SELECT bl.series_id, count(*) AS count
      FROM txn t JOIN txn_part p ON p.txn_id = t.id JOIN budget_line bl ON bl.id = p.line_id
      WHERE t.budget_id = ${budgetId} AND t.created_at >= ${since} AND t.created_by = ${viewer} AND ${visible}
      GROUP BY bl.series_id`);
    const lastMethods = await exec.execute<{
      payer_membership_id: string | null;
      payment_method: PaymentMethod;
    }>(sql`
      SELECT DISTINCT ON (payer_membership_id) payer_membership_id, payment_method
      FROM txn WHERE budget_id = ${budgetId} AND created_by = ${viewer} AND origin IN ('quick_add', 'edit_form')
      ORDER BY payer_membership_id, created_at DESC`);
    const latest = await exec.execute<{ latest: Date | null }>(
      sql`SELECT max(updated_at) AS latest FROM txn WHERE budget_id = ${budgetId}`,
    );
    return {
      labels: labels.rows.map((r) => ({
        normalizedLabel: r.normalized_label,
        seriesId: r.series_id,
        count: Number(r.count),
        lastUsedAt: new Date(r.last_used_at),
      })),
      mostUsed: mostUsed.rows.map((r) => ({
        seriesId: r.series_id,
        count: Number(r.count),
      })),
      lastMethods: lastMethods.rows.map((r) => ({
        payerMembershipId: r.payer_membership_id,
        paymentMethod: r.payment_method,
      })),
      latestUpdate: latest.rows[0]?.latest
        ? new Date(latest.rows[0].latest)
        : null,
    };
  }
}
