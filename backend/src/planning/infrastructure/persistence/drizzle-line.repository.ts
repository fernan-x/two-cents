import { Injectable } from '@nestjs/common';
import type { Formula, FormulaKind, SplitMode } from '@two-cents/shared/domain';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import {
  budgetLineShares,
  budgetLines,
  envelopeSubItems,
} from '../../../shared-kernel/infrastructure/db/schema';
import {
  type AmountFields,
  BudgetLine,
} from '../../domain/entities/budget-line';
import type { LineRepository } from '../../domain/ports/repositories';

type StoredFormula = { kind: string; baseMinor: string; factor: number };
type StoredAmounts = {
  totalMinor: string;
  splitMode: SplitMode | null;
  payerMembershipId: string | null;
  shares: Record<string, string>;
  formula: StoredFormula | null;
};

const formulaIn = (f: StoredFormula | null | undefined): Formula | null =>
  f
    ? {
        kind: f.kind as FormulaKind,
        baseMinor: BigInt(f.baseMinor),
        factor: f.factor,
      }
    : null;
const formulaOut = (f: Formula | null): StoredFormula | null =>
  f
    ? { kind: f.kind, baseMinor: f.baseMinor.toString(), factor: f.factor }
    : null;

const amountsIn = (a: StoredAmounts | null | undefined): AmountFields | null =>
  a
    ? {
        totalMinor: BigInt(a.totalMinor),
        splitMode: a.splitMode,
        payerMembershipId: a.payerMembershipId,
        shares: Object.fromEntries(
          Object.entries(a.shares).map(([k, v]) => [k, BigInt(v)]),
        ),
        formula: formulaIn(a.formula),
      }
    : null;
const amountsOut = (a: AmountFields | null): StoredAmounts | null =>
  a
    ? {
        totalMinor: a.totalMinor.toString(),
        splitMode: a.splitMode,
        payerMembershipId: a.payerMembershipId,
        shares: Object.fromEntries(
          Object.entries(a.shares).map(([k, v]) => [k, v.toString()]),
        ),
        formula: formulaOut(a.formula),
      }
    : null;

/** Lines with their shares and sub-items, in three queries (research R19). */
@Injectable()
export class DrizzleLineRepository implements LineRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  listForMonth(monthId: string): Promise<BudgetLine[]> {
    return this.listForMonths([monthId]);
  }

  async listForMonths(monthIds: readonly string[]): Promise<BudgetLine[]> {
    if (monthIds.length === 0) return [];
    const ex = this.db.executor();
    const rows = await ex
      .select()
      .from(budgetLines)
      .where(inArray(budgetLines.monthId, [...monthIds]))
      .orderBy(asc(budgetLines.group), asc(budgetLines.position));
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [shares, subItems] = await Promise.all([
      ex
        .select()
        .from(budgetLineShares)
        .where(inArray(budgetLineShares.lineId, ids)),
      ex
        .select()
        .from(envelopeSubItems)
        .where(inArray(envelopeSubItems.lineId, ids))
        .orderBy(asc(envelopeSubItems.position)),
    ]);
    return rows.map((r) =>
      BudgetLine.fromPersistence({
        id: r.id,
        monthId: r.monthId,
        budgetId: r.budgetId,
        seriesId: r.seriesId,
        group: r.group,
        kind: r.kind,
        label: r.label,
        categoryId: r.categoryId,
        isEnvelope: r.isEnvelope,
        ownerMembershipId: r.ownerMembershipId,
        isPrivate: r.isPrivate,
        splitMode: r.splitMode,
        payerMembershipId: r.payerMembershipId,
        totalMinor: r.totalMinor,
        currency: r.currency,
        formula: formulaIn(r.formula),
        position: r.position,
        version: r.version,
        handEdited: r.handEdited,
        usual: amountsIn(r.usual as StoredAmounts | null),
        needsReview: r.needsReview,
        needsIncome: r.needsIncome,
        shares: Object.fromEntries(
          shares
            .filter((s) => s.lineId === r.id)
            .map((s) => [s.membershipId, s.amountMinor]),
        ),
        subItems: subItems
          .filter((s) => s.lineId === r.id)
          .map((s) => ({
            id: s.id,
            label: s.label,
            amountMinor: s.amountMinor,
            position: s.position,
          })),
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        updatedAt: r.updatedAt,
        updatedBy: r.updatedBy,
      }),
    );
  }

  async save(line: BudgetLine): Promise<void> {
    const p = line.toPersistence();
    const ex = this.db.executor();
    const row = {
      id: p.id,
      monthId: p.monthId,
      budgetId: p.budgetId,
      seriesId: p.seriesId,
      group: p.group,
      kind: p.kind,
      label: p.label,
      categoryId: p.categoryId,
      isEnvelope: p.isEnvelope,
      ownerMembershipId: p.ownerMembershipId,
      isPrivate: p.isPrivate,
      splitMode: p.splitMode,
      payerMembershipId: p.payerMembershipId,
      totalMinor: p.totalMinor,
      currency: p.currency,
      formula: formulaOut(p.formula),
      position: p.position,
      version: p.version,
      handEdited: p.handEdited,
      usual: amountsOut(p.usual),
      needsReview: p.needsReview,
      needsIncome: p.needsIncome,
      createdAt: p.createdAt,
      createdBy: p.createdBy,
      updatedAt: p.updatedAt,
      updatedBy: p.updatedBy,
    };
    const { id: _id, createdAt: _c, createdBy: _cb, ...updatable } = row;
    await ex
      .insert(budgetLines)
      .values(row)
      .onConflictDoUpdate({ target: budgetLines.id, set: updatable });
    await ex.delete(budgetLineShares).where(eq(budgetLineShares.lineId, p.id));
    const shareRows = Object.entries(p.shares).map(
      ([membershipId, amountMinor]) => ({
        lineId: p.id,
        membershipId,
        amountMinor,
      }),
    );
    if (shareRows.length > 0)
      await ex.insert(budgetLineShares).values(shareRows);
    await ex.delete(envelopeSubItems).where(eq(envelopeSubItems.lineId, p.id));
    if (p.subItems.length > 0)
      await ex.insert(envelopeSubItems).values(
        p.subItems.map((s) => ({
          id: s.id,
          lineId: p.id,
          label: s.label,
          amountMinor: s.amountMinor,
          position: s.position,
        })),
      );
  }

  async delete(lineId: string): Promise<void> {
    await this.db
      .executor()
      .delete(budgetLines)
      .where(eq(budgetLines.id, lineId));
  }

  async existsForMonth(monthId: string): Promise<boolean> {
    const [row] = await this.db
      .executor()
      .select({ one: sql<number>`1` })
      .from(budgetLines)
      .where(eq(budgetLines.monthId, monthId))
      .limit(1);
    return !!row;
  }
}
