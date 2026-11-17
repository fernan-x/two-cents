import {
  type MonthAction,
  type MonthStatus,
  transitionMonth,
} from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';

export type MonthCreatedFrom =
  'previous' | 'month' | 'template' | 'scratch' | 'import' | 'income';

/** The frozen summary of a closed month, amounts as integer strings (FR-036). */
export type ClosedSummary = Record<string, unknown>;

export interface BudgetMonthProps {
  id: string;
  budgetId: string;
  periodStart: string;
  periodEnd: string;
  status: MonthStatus;
  revision: bigint;
  createdFrom: MonthCreatedFrom;
  sourceMonthId: string | null;
  sourceTemplateId: string | null;
  createdAt: Date;
  createdBy: string | null;
  activatedAt: Date | null;
  activatedBy: string | null;
  closedAt: Date | null;
  closedBy: string | null;
  closedSummary: ClosedSummary | null;
}

/** One planning period of a budget (data-model.md `budget_month`). */
export class BudgetMonth {
  private constructor(private props: BudgetMonthProps) {}

  static create(input: {
    id: string;
    budgetId: string;
    period: { start: string; end: string };
    createdFrom: MonthCreatedFrom;
    sourceMonthId?: string | null;
    sourceTemplateId?: string | null;
    by: string | null;
    now: Date;
  }): BudgetMonth {
    return new BudgetMonth({
      id: input.id,
      budgetId: input.budgetId,
      periodStart: input.period.start,
      periodEnd: input.period.end,
      status: 'draft',
      revision: 0n,
      createdFrom: input.createdFrom,
      sourceMonthId: input.sourceMonthId ?? null,
      sourceTemplateId: input.sourceTemplateId ?? null,
      createdAt: input.now,
      createdBy: input.by,
      activatedAt: null,
      activatedBy: null,
      closedAt: null,
      closedBy: null,
      closedSummary: null,
    });
  }

  static fromPersistence(props: BudgetMonthProps): BudgetMonth {
    return new BudgetMonth({ ...props });
  }

  toPersistence(): BudgetMonthProps {
    return { ...this.props };
  }

  /** Writes to a closed month are refused (FR-036). */
  assertWritable(): void {
    if (this.props.status === 'closed') throw new DomainError('MONTH_CLOSED');
  }

  /** Applies a status change (FR-002); closing needs the summary to freeze. */
  changeStatus(
    action: MonthAction,
    by: string,
    now: Date,
    closedSummary?: ClosedSummary,
  ): void {
    let next: MonthStatus;
    try {
      next = transitionMonth(this.props.status, action);
    } catch {
      throw new DomainError('INVALID_TRANSITION');
    }
    this.props.status = next;
    if (action === 'activate' && !this.props.activatedAt) {
      this.props.activatedAt = now;
      this.props.activatedBy = by;
    }
    if (action === 'close') {
      if (!closedSummary) throw new Error('closing a month needs its summary');
      this.props.closedAt = now;
      this.props.closedBy = by;
      this.props.closedSummary = closedSummary;
    }
    if (action === 'reopen') {
      this.props.closedAt = null;
      this.props.closedBy = null;
      this.props.closedSummary = null;
    }
  }

  /** Imported past months are created closed directly (research R16). */
  closeOnImport(by: string, now: Date, closedSummary: ClosedSummary): void {
    this.props.status = 'closed';
    this.props.closedAt = now;
    this.props.closedBy = by;
    this.props.closedSummary = closedSummary;
  }

  /** Fills an empty month from a source (research R14). */
  markFilledFrom(
    createdFrom: MonthCreatedFrom,
    sourceMonthId: string | null,
    sourceTemplateId: string | null,
  ): void {
    this.props.createdFrom = createdFrom;
    this.props.sourceMonthId = sourceMonthId;
    this.props.sourceTemplateId = sourceTemplateId;
  }

  get id() {
    return this.props.id;
  }
  get budgetId() {
    return this.props.budgetId;
  }
  get periodStart() {
    return this.props.periodStart;
  }
  get periodEnd() {
    return this.props.periodEnd;
  }
  get period() {
    return { start: this.props.periodStart, end: this.props.periodEnd };
  }
  get status() {
    return this.props.status;
  }
  get revision() {
    return this.props.revision;
  }
  get createdFrom() {
    return this.props.createdFrom;
  }
  get activatedAt() {
    return this.props.activatedAt;
  }
  get closedAt() {
    return this.props.closedAt;
  }
  get closedSummary() {
    return this.props.closedSummary;
  }
}
