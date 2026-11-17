import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import {
  budgetCategories,
  incomeLines,
  monthChanges,
  monthTemplates,
} from '../../../shared-kernel/infrastructure/db/schema';
import { IncomeLine } from '../../domain/entities/income-line';
import type {
  CategoryRecord,
  CategoryRepository,
  ChangeLog,
  ChangeRecord,
  IncomeLineRepository,
  TemplateRecord,
  TemplateRepository,
} from '../../domain/ports/repositories';

@Injectable()
export class DrizzleIncomeLineRepository implements IncomeLineRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  listForMonth(monthId: string): Promise<IncomeLine[]> {
    return this.listForMonths([monthId]);
  }

  async listForMonths(monthIds: readonly string[]): Promise<IncomeLine[]> {
    if (monthIds.length === 0) return [];
    const rows = await this.db
      .executor()
      .select()
      .from(incomeLines)
      .where(inArray(incomeLines.monthId, [...monthIds]))
      .orderBy(asc(incomeLines.position), asc(incomeLines.id));
    return rows.map((r) => IncomeLine.fromPersistence(r));
  }

  async save(income: IncomeLine): Promise<void> {
    const row = income.toPersistence();
    const { id: _id, createdAt: _c, createdBy: _cb, ...updatable } = row;
    await this.db
      .executor()
      .insert(incomeLines)
      .values(row)
      .onConflictDoUpdate({ target: incomeLines.id, set: updatable });
  }

  async delete(id: string): Promise<void> {
    await this.db.executor().delete(incomeLines).where(eq(incomeLines.id, id));
  }
}

@Injectable()
export class DrizzleChangeLog implements ChangeLog {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async record(change: ChangeRecord): Promise<void> {
    await this.db.executor().insert(monthChanges).values(change);
  }

  async list(
    monthId: string,
    options: { before: string | null; limit: number; includeDraft: boolean },
  ): Promise<ChangeRecord[]> {
    // Ids are UUID v7, so they sort by creation time.
    return this.db
      .executor()
      .select()
      .from(monthChanges)
      .where(
        and(
          eq(monthChanges.monthId, monthId),
          options.before ? lt(monthChanges.id, options.before) : undefined,
          options.includeDraft
            ? undefined
            : ne(monthChanges.monthStatus, 'draft'),
        ),
      )
      .orderBy(desc(monthChanges.id))
      .limit(options.limit);
  }
}

@Injectable()
export class DrizzleTemplateRepository implements TemplateRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  list(budgetId: string): Promise<TemplateRecord[]> {
    return this.db
      .executor()
      .select()
      .from(monthTemplates)
      .where(eq(monthTemplates.budgetId, budgetId))
      .orderBy(asc(monthTemplates.name));
  }

  async findById(budgetId: string, id: string): Promise<TemplateRecord | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(monthTemplates)
      .where(
        and(eq(monthTemplates.budgetId, budgetId), eq(monthTemplates.id, id)),
      )
      .limit(1);
    return row ?? null;
  }

  async nameTaken(
    budgetId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .executor()
      .select({ id: monthTemplates.id })
      .from(monthTemplates)
      .where(
        and(
          eq(monthTemplates.budgetId, budgetId),
          sql`lower(${monthTemplates.name}) = lower(${name})`,
          exceptId ? ne(monthTemplates.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    return !!row;
  }

  async save(t: TemplateRecord): Promise<void> {
    await this.db
      .executor()
      .insert(monthTemplates)
      .values(t)
      .onConflictDoUpdate({
        target: monthTemplates.id,
        set: { name: t.name, lines: t.lines, updatedAt: t.updatedAt },
      });
  }

  async delete(id: string): Promise<void> {
    await this.db
      .executor()
      .delete(monthTemplates)
      .where(eq(monthTemplates.id, id));
  }
}

const DEFAULT_CATEGORIES = [
  'housing',
  'food',
  'transport',
  'pets',
  'leisure',
  'health',
  'subscriptions',
  'savings',
  'gifts',
  'other',
] as const;

@Injectable()
export class DrizzleCategoryRepository implements CategoryRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  list(budgetId: string): Promise<CategoryRecord[]> {
    return this.db
      .executor()
      .select()
      .from(budgetCategories)
      .where(eq(budgetCategories.budgetId, budgetId))
      .orderBy(asc(budgetCategories.position), asc(budgetCategories.id));
  }

  async findById(budgetId: string, id: string): Promise<CategoryRecord | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(budgetCategories)
      .where(
        and(
          eq(budgetCategories.budgetId, budgetId),
          eq(budgetCategories.id, id),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async nameTaken(
    budgetId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .executor()
      .select({ id: budgetCategories.id })
      .from(budgetCategories)
      .where(
        and(
          eq(budgetCategories.budgetId, budgetId),
          sql`lower(${budgetCategories.name}) = lower(${name})`,
          exceptId ? ne(budgetCategories.id, exceptId) : undefined,
        ),
      )
      .limit(1);
    return !!row;
  }

  async save(c: CategoryRecord): Promise<void> {
    await this.db
      .executor()
      .insert(budgetCategories)
      .values({
        ...c,
        systemKey: c.systemKey as (typeof DEFAULT_CATEGORIES)[number] | null,
      })
      .onConflictDoUpdate({
        target: budgetCategories.id,
        set: { name: c.name, position: c.position },
      });
  }

  async delete(id: string): Promise<void> {
    await this.db
      .executor()
      .delete(budgetCategories)
      .where(eq(budgetCategories.id, id));
  }

  async seedDefaults(budgetId: string): Promise<void> {
    await this.db
      .executor()
      .insert(budgetCategories)
      .values(
        DEFAULT_CATEGORIES.map((key, position) => ({
          id: crypto.randomUUID(),
          budgetId,
          systemKey: key,
          name: null,
          position,
        })),
      );
  }
}
