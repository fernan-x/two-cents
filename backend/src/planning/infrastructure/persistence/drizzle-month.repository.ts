import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, lt, ne, sql } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import { budgetMonths } from '../../../shared-kernel/infrastructure/db/schema';
import { BudgetMonth } from '../../domain/entities/budget-month';
import type { MonthRepository } from '../../domain/ports/repositories';

type Row = typeof budgetMonths.$inferSelect;

const toEntity = (r: Row) =>
  BudgetMonth.fromPersistence({
    id: r.id,
    budgetId: r.budgetId,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    status: r.status,
    revision: r.revision,
    createdFrom: r.createdFrom,
    sourceMonthId: r.sourceMonthId,
    sourceTemplateId: r.sourceTemplateId,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
    activatedAt: r.activatedAt,
    activatedBy: r.activatedBy,
    closedAt: r.closedAt,
    closedBy: r.closedBy,
    closedSummary: r.closedSummary ?? null,
  });

@Injectable()
export class DrizzleMonthRepository implements MonthRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async findByStart(
    budgetId: string,
    periodStart: string,
    options: { forUpdate?: boolean } = {},
  ): Promise<BudgetMonth | null> {
    const query = this.db
      .executor()
      .select()
      .from(budgetMonths)
      .where(
        and(
          eq(budgetMonths.budgetId, budgetId),
          eq(budgetMonths.periodStart, periodStart),
        ),
      )
      .limit(1);
    const [row] = options.forUpdate ? await query.for('update') : await query;
    return row ? toEntity(row) : null;
  }

  async findById(
    id: string,
    options: { forUpdate?: boolean } = {},
  ): Promise<BudgetMonth | null> {
    const query = this.db
      .executor()
      .select()
      .from(budgetMonths)
      .where(eq(budgetMonths.id, id))
      .limit(1);
    const [row] = options.forUpdate ? await query.for('update') : await query;
    return row ? toEntity(row) : null;
  }

  async findLatestBefore(
    budgetId: string,
    before: string,
  ): Promise<BudgetMonth | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(budgetMonths)
      .where(
        and(
          eq(budgetMonths.budgetId, budgetId),
          lt(budgetMonths.periodStart, before),
        ),
      )
      .orderBy(desc(budgetMonths.periodStart))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async list(
    budgetId: string,
    cursor: string | null,
    limit: number,
  ): Promise<BudgetMonth[]> {
    const rows = await this.db
      .executor()
      .select()
      .from(budgetMonths)
      .where(
        and(
          eq(budgetMonths.budgetId, budgetId),
          cursor ? lt(budgetMonths.periodStart, cursor) : undefined,
        ),
      )
      .orderBy(desc(budgetMonths.periodStart))
      .limit(limit);
    return rows.map(toEntity);
  }

  async listAfter(budgetId: string, after: string): Promise<BudgetMonth[]> {
    const rows = await this.db
      .executor()
      .select()
      .from(budgetMonths)
      .where(
        and(
          eq(budgetMonths.budgetId, budgetId),
          gt(budgetMonths.periodStart, after),
        ),
      )
      .orderBy(asc(budgetMonths.periodStart));
    return rows.map(toEntity);
  }

  async listOpen(budgetId: string): Promise<BudgetMonth[]> {
    const rows = await this.db
      .executor()
      .select()
      .from(budgetMonths)
      .where(
        and(
          eq(budgetMonths.budgetId, budgetId),
          ne(budgetMonths.status, 'closed'),
        ),
      )
      .orderBy(asc(budgetMonths.periodStart));
    return rows.map(toEntity);
  }

  async revisionOf(
    budgetId: string,
    periodStart: string,
  ): Promise<bigint | null> {
    const [row] = await this.db
      .executor()
      .select({ revision: budgetMonths.revision })
      .from(budgetMonths)
      .where(
        and(
          eq(budgetMonths.budgetId, budgetId),
          eq(budgetMonths.periodStart, periodStart),
        ),
      )
      .limit(1);
    return row ? row.revision : null;
  }

  async save(month: BudgetMonth): Promise<void> {
    const p = month.toPersistence();
    const { id: _id, revision: _revision, ...rest } = p;
    await this.db
      .executor()
      .insert(budgetMonths)
      .values(p)
      .onConflictDoUpdate({ target: budgetMonths.id, set: rest });
  }

  async bumpRevision(monthId: string): Promise<bigint> {
    const [row] = await this.db
      .executor()
      .update(budgetMonths)
      .set({ revision: sql`${budgetMonths.revision} + 1` })
      .where(eq(budgetMonths.id, monthId))
      .returning({ revision: budgetMonths.revision });
    return row.revision;
  }
}
