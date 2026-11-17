import type { BudgetLine } from '../entities/budget-line';
import type { BudgetMonth } from '../entities/budget-month';
import type { IncomeLine } from '../entities/income-line';

export interface MonthRepository {
  findByStart(
    budgetId: string,
    periodStart: string,
    options?: { forUpdate?: boolean },
  ): Promise<BudgetMonth | null>;
  findById(
    id: string,
    options?: { forUpdate?: boolean },
  ): Promise<BudgetMonth | null>;
  /** The latest month starting before `before` (source "previous", US2). */
  findLatestBefore(
    budgetId: string,
    before: string,
  ): Promise<BudgetMonth | null>;
  /** Newest first, `period_start < cursor` when given. */
  list(
    budgetId: string,
    cursor: string | null,
    limit: number,
  ): Promise<BudgetMonth[]>;
  /** Months starting after `after`, ascending (propagation, R7). */
  listAfter(budgetId: string, after: string): Promise<BudgetMonth[]>;
  /** Months of the budget not closed (membership sync). */
  listOpen(budgetId: string): Promise<BudgetMonth[]>;
  /** Cheap ETag path (R4): the revision only. */
  revisionOf(budgetId: string, periodStart: string): Promise<bigint | null>;
  save(month: BudgetMonth): Promise<void>;
  /** +1 on the revision (R4). */
  bumpRevision(monthId: string): Promise<bigint>;
}
export const MONTH_REPOSITORY = Symbol('MonthRepository');

export interface LineRepository {
  listForMonth(monthId: string): Promise<BudgetLine[]>;
  listForMonths(monthIds: readonly string[]): Promise<BudgetLine[]>;
  /** Inserts or updates the line, replacing its shares and sub-items. */
  save(line: BudgetLine): Promise<void>;
  delete(lineId: string): Promise<void>;
  /** Whether the month has any budget line (filling an empty month, R14). */
  existsForMonth(monthId: string): Promise<boolean>;
}
export const LINE_REPOSITORY = Symbol('LineRepository');

export interface IncomeLineRepository {
  listForMonth(monthId: string): Promise<IncomeLine[]>;
  listForMonths(monthIds: readonly string[]): Promise<IncomeLine[]>;
  save(income: IncomeLine): Promise<void>;
  delete(id: string): Promise<void>;
}
export const INCOME_LINE_REPOSITORY = Symbol('IncomeLineRepository');

export type ChangeCause =
  'user' | 'propagation' | 'recompute' | 'import' | 'system';
export type ChangeEntity = 'line' | 'income' | 'month' | 'order';
export type ChangeAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'reordered'
  | 'activated'
  | 'closed'
  | 'reopened'
  | 'confirmed';

export interface FieldChange {
  field: string;
  old: string | null;
  new: string | null;
}

/** One history entry (data-model.md `month_change`, FR-035). */
export interface ChangeRecord {
  id: string;
  monthId: string;
  actorMembershipId: string | null;
  cause: ChangeCause;
  entity: ChangeEntity;
  entityId: string | null;
  action: ChangeAction;
  isPrivate: boolean;
  ownerMembershipId: string | null;
  labelSnapshot: string | null;
  changes: FieldChange[];
  monthStatus: 'draft' | 'active' | 'closed';
  createdAt: Date;
}

export interface ChangeLog {
  record(change: ChangeRecord): Promise<void>;
  /** Newest first; `before` = id cursor; `includeDraft` false hides Draft-time records (R11). */
  list(
    monthId: string,
    options: { before: string | null; limit: number; includeDraft: boolean },
  ): Promise<ChangeRecord[]>;
}
export const CHANGE_LOG = Symbol('ChangeLog');

export interface TemplateRecord {
  id: string;
  budgetId: string;
  name: string;
  lines: unknown[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateRepository {
  list(budgetId: string): Promise<TemplateRecord[]>;
  findById(budgetId: string, id: string): Promise<TemplateRecord | null>;
  nameTaken(
    budgetId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean>;
  save(template: TemplateRecord): Promise<void>;
  delete(id: string): Promise<void>;
}
export const TEMPLATE_REPOSITORY = Symbol('TemplateRepository');

export interface CategoryRecord {
  id: string;
  budgetId: string;
  systemKey: string | null;
  name: string | null;
  position: number;
}

export interface CategoryRepository {
  list(budgetId: string): Promise<CategoryRecord[]>;
  findById(budgetId: string, id: string): Promise<CategoryRecord | null>;
  nameTaken(
    budgetId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean>;
  save(category: CategoryRecord): Promise<void>;
  delete(id: string): Promise<void>;
  seedDefaults(budgetId: string): Promise<void>;
}
export const CATEGORY_REPOSITORY = Symbol('CategoryRepository');
