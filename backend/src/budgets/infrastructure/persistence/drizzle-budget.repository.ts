import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNotNull, lt } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import {
  budgetMonthStartRules,
  budgets,
} from '../../../shared-kernel/infrastructure/db/schema';
import { Budget } from '../../domain/entities/budget';
import type { BudgetRepository } from '../../domain/ports/repositories';

type BudgetRow = typeof budgets.$inferSelect;

@Injectable()
export class DrizzleBudgetRepository implements BudgetRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async findById(id: string): Promise<Budget | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(budgets)
      .where(eq(budgets.id, id))
      .limit(1);
    return row ? (await this.toEntities([row]))[0] : null;
  }

  async findByIdForUpdate(id: string): Promise<Budget | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(budgets)
      .where(eq(budgets.id, id))
      .for('update')
      .limit(1);
    return row ? (await this.toEntities([row]))[0] : null;
  }

  async findByIds(ids: readonly string[]): Promise<Budget[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .executor()
      .select()
      .from(budgets)
      .where(inArray(budgets.id, [...ids]));
    return this.toEntities(rows);
  }

  async save(budget: Budget): Promise<void> {
    const { rules, ...row } = budget.toPersistence();
    const ex = this.db.executor();
    await ex
      .insert(budgets)
      .values(row)
      .onConflictDoUpdate({
        target: budgets.id,
        set: {
          name: row.name,
          currency: row.currency,
          timeZone: row.timeZone,
          deletedAt: row.deletedAt,
          deletedBy: row.deletedBy,
        },
      });
    await ex
      .delete(budgetMonthStartRules)
      .where(eq(budgetMonthStartRules.budgetId, row.id));
    await ex
      .insert(budgetMonthStartRules)
      .values(rules.map((r) => ({ budgetId: row.id, ...r })));
  }

  async listRestorableBy(
    userId: string,
    deletedAfter: Date,
  ): Promise<Budget[]> {
    const rows = await this.db
      .executor()
      .select()
      .from(budgets)
      .where(
        and(eq(budgets.deletedBy, userId), gt(budgets.deletedAt, deletedAfter)),
      );
    return this.toEntities(rows);
  }

  async listDeletedBefore(cutoff: Date, limit: number): Promise<string[]> {
    const rows = await this.db
      .executor()
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(isNotNull(budgets.deletedAt), lt(budgets.deletedAt, cutoff)))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async purge(id: string): Promise<void> {
    await this.db.executor().delete(budgets).where(eq(budgets.id, id));
  }

  private async toEntities(rows: BudgetRow[]): Promise<Budget[]> {
    if (rows.length === 0) return [];
    const rules = await this.db
      .executor()
      .select()
      .from(budgetMonthStartRules)
      .where(
        inArray(
          budgetMonthStartRules.budgetId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(budgetMonthStartRules.effectiveFrom));
    return rows.map((row) =>
      Budget.fromPersistence({
        ...row,
        rules: rules
          .filter((r) => r.budgetId === row.id)
          .map((r) => ({
            effectiveFrom: r.effectiveFrom,
            startDay: r.startDay,
          })),
      }),
    );
  }
}
