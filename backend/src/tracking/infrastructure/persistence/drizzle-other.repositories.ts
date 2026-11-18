import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import {
  bankCsvMappings,
  budgetLines,
  budgetMonths,
  recurringSkips,
  recurringTxnRules,
  settlements,
  suggestionStats,
  txnReceipts,
  txns,
} from '../../../shared-kernel/infrastructure/db/schema';
import type {
  CsvMappingRepository,
  ReceiptRecord,
  ReceiptStore,
  RecurringRuleRecord,
  RecurringRuleRepository,
  SettlementRecord,
  SettlementRepository,
  SuggestionStats,
} from '../../domain/ports/repositories';

@Injectable()
export class DrizzleReceiptStore implements ReceiptStore {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async count(txnId: string): Promise<number> {
    const [row] = await this.db
      .executor()
      .select({ n: sql<string>`count(*)` })
      .from(txnReceipts)
      .where(eq(txnReceipts.txnId, txnId));
    return Number(row?.n ?? 0);
  }

  async find(txnId: string, id: string): Promise<ReceiptRecord | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(txnReceipts)
      .where(and(eq(txnReceipts.id, id), eq(txnReceipts.txnId, txnId)))
      .limit(1);
    return row ?? null;
  }

  async insert(receipt: ReceiptRecord): Promise<boolean> {
    const rows = await this.db
      .executor()
      .insert(txnReceipts)
      .values(receipt)
      .onConflictDoNothing()
      .returning({ id: txnReceipts.id });
    return rows.length > 0;
  }

  async delete(txnId: string, id: string): Promise<void> {
    await this.db
      .executor()
      .delete(txnReceipts)
      .where(and(eq(txnReceipts.id, id), eq(txnReceipts.txnId, txnId)));
  }

  async listForBudget(budgetId: string): Promise<ReceiptRecord[]> {
    const rows = await this.db
      .executor()
      .select({ r: txnReceipts })
      .from(txnReceipts)
      .innerJoin(txns, eq(txns.id, txnReceipts.txnId))
      .where(eq(txns.budgetId, budgetId));
    return rows.map((x) => x.r);
  }
}

@Injectable()
export class DrizzleSettlementRepository implements SettlementRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  listForMonth(monthId: string): Promise<SettlementRecord[]> {
    return this.db
      .executor()
      .select()
      .from(settlements)
      .where(eq(settlements.monthId, monthId))
      .orderBy(asc(settlements.createdAt));
  }

  async insert(s: SettlementRecord): Promise<void> {
    await this.db.executor().insert(settlements).values(s);
  }
}

@Injectable()
export class DrizzleRecurringRuleRepository implements RecurringRuleRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  list(budgetId: string): Promise<RecurringRuleRecord[]> {
    return this.db
      .executor()
      .select()
      .from(recurringTxnRules)
      .where(eq(recurringTxnRules.budgetId, budgetId))
      .orderBy(asc(recurringTxnRules.dayOfMonth), asc(recurringTxnRules.id));
  }

  async budgetsWithActiveRules(): Promise<string[]> {
    const rows = await this.db
      .executor()
      .selectDistinct({ budgetId: recurringTxnRules.budgetId })
      .from(recurringTxnRules)
      .where(eq(recurringTxnRules.active, true));
    return rows.map((r) => r.budgetId);
  }

  async seriesInfo(budgetId: string, seriesId: string) {
    const [row] = await this.db
      .executor()
      .select({
        group: budgetLines.group,
        ownerMembershipId: budgetLines.ownerMembershipId,
        label: budgetLines.label,
      })
      .from(budgetLines)
      .innerJoin(budgetMonths, eq(budgetMonths.id, budgetLines.monthId))
      .where(
        and(
          eq(budgetLines.budgetId, budgetId),
          eq(budgetLines.seriesId, seriesId),
        ),
      )
      .orderBy(desc(budgetMonths.periodStart))
      .limit(1);
    return row ?? null;
  }

  async findById(
    budgetId: string,
    id: string,
  ): Promise<RecurringRuleRecord | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(recurringTxnRules)
      .where(
        and(
          eq(recurringTxnRules.id, id),
          eq(recurringTxnRules.budgetId, budgetId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async save(rule: RecurringRuleRecord): Promise<void> {
    const { id: _id, createdAt: _c, createdBy: _cb, ...updatable } = rule;
    await this.db
      .executor()
      .insert(recurringTxnRules)
      .values(rule)
      .onConflictDoUpdate({ target: recurringTxnRules.id, set: updatable });
  }

  async delete(id: string): Promise<void> {
    await this.db
      .executor()
      .delete(recurringTxnRules)
      .where(eq(recurringTxnRules.id, id));
  }

  async recordSkip(
    ruleId: string,
    scheduledDate: string,
    now: Date,
  ): Promise<boolean> {
    const rows = await this.db
      .executor()
      .insert(recurringSkips)
      .values({ ruleId, scheduledDate, reason: 'month_closed', createdAt: now })
      .onConflictDoNothing()
      .returning({ ruleId: recurringSkips.ruleId });
    return rows.length > 0;
  }
}

@Injectable()
export class DrizzleCsvMappingRepository implements CsvMappingRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async find(
    budgetId: string,
    fingerprint: string,
  ): Promise<Record<string, unknown> | null> {
    const [row] = await this.db
      .executor()
      .select({ mapping: bankCsvMappings.mapping })
      .from(bankCsvMappings)
      .where(
        and(
          eq(bankCsvMappings.budgetId, budgetId),
          eq(bankCsvMappings.headerFingerprint, fingerprint),
        ),
      )
      .limit(1);
    return row?.mapping ?? null;
  }

  async upsert(
    budgetId: string,
    fingerprint: string,
    mapping: Record<string, unknown>,
    by: string,
    now: Date,
    id: string,
  ): Promise<void> {
    await this.db
      .executor()
      .insert(bankCsvMappings)
      .values({
        id,
        budgetId,
        headerFingerprint: fingerprint,
        mapping,
        updatedAt: now,
        updatedBy: by,
      })
      .onConflictDoUpdate({
        target: [bankCsvMappings.budgetId, bankCsvMappings.headerFingerprint],
        set: { mapping, updatedAt: now, updatedBy: by },
      });
  }
}

@Injectable()
export class DrizzleSuggestionStats implements SuggestionStats {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async increment(
    budgetId: string,
    membershipId: string,
    day: string,
    outcome: 'kept' | 'changed',
  ): Promise<void> {
    const kept = outcome === 'kept' ? 1 : 0;
    const changed = outcome === 'changed' ? 1 : 0;
    await this.db
      .executor()
      .insert(suggestionStats)
      .values({ budgetId, membershipId, day, kept, changed })
      .onConflictDoUpdate({
        target: [
          suggestionStats.budgetId,
          suggestionStats.membershipId,
          suggestionStats.day,
        ],
        set: {
          kept: sql`${suggestionStats.kept} + ${kept}`,
          changed: sql`${suggestionStats.changed} + ${changed}`,
        },
      });
  }
}
