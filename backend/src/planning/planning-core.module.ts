import { Module, type Provider } from '@nestjs/common';
import { BudgetsCoreModule } from '../budgets/budgets-core.module';
import { MonthDetailView } from './application/services/month-detail-view';
import { MonthMembershipSync } from './application/services/month-membership-sync';
import { MonthWriter } from './application/services/month-writer';
import { PlanningHooks } from './application/services/planning-hooks';
import { PropagateRecurring } from './application/services/propagate-recurring';
import { RecomputeProportional } from './application/services/recompute-proportional';
import { ImportMonths } from './application/use-cases/import-months';
import { Lines } from './application/use-cases/lines';
import { ListMonths } from './application/use-cases/list-months';
import { CreateMonth, GetMonth } from './application/use-cases/months';
import { Templates } from './application/use-cases/templates';
import { Categories } from './application/use-cases/categories';
import {
  ChangeMonthStatus,
  GetMonthHistory,
} from './application/use-cases/status-and-history';
import {
  IncomeLines,
  UpsertPrimaryIncome,
} from './application/use-cases/income-lines';
import {
  CATEGORY_REPOSITORY,
  CHANGE_LOG,
  INCOME_LINE_REPOSITORY,
  LINE_REPOSITORY,
  MONTH_REPOSITORY,
  TEMPLATE_REPOSITORY,
} from './domain/ports/repositories';
import { DrizzleLineRepository } from './infrastructure/persistence/drizzle-line.repository';
import { DrizzleMonthRepository } from './infrastructure/persistence/drizzle-month.repository';
import {
  DrizzleCategoryRepository,
  DrizzleChangeLog,
  DrizzleIncomeLineRepository,
  DrizzleTemplateRepository,
} from './infrastructure/persistence/drizzle-other.repositories';

const adapters: Provider[] = [
  { provide: MONTH_REPOSITORY, useClass: DrizzleMonthRepository },
  { provide: LINE_REPOSITORY, useClass: DrizzleLineRepository },
  { provide: INCOME_LINE_REPOSITORY, useClass: DrizzleIncomeLineRepository },
  { provide: CHANGE_LOG, useClass: DrizzleChangeLog },
  { provide: TEMPLATE_REPOSITORY, useClass: DrizzleTemplateRepository },
  { provide: CATEGORY_REPOSITORY, useClass: DrizzleCategoryRepository },
];

export const PLANNING_USE_CASES: Provider[] = [
  PlanningHooks,
  MonthDetailView,
  MonthWriter,
  RecomputeProportional,
  PropagateRecurring,
  IncomeLines,
  Lines,
  CreateMonth,
  GetMonth,
  Templates,
  Categories,
  ChangeMonthStatus,
  GetMonthHistory,
  ListMonths,
  ImportMonths,
  UpsertPrimaryIncome,
];

/** Spec 003 without its HTTP layer; the budgets HTTP layer uses it for the 002 income route (R13). */
@Module({
  imports: [BudgetsCoreModule],
  providers: [...adapters, ...PLANNING_USE_CASES, MonthMembershipSync],
  exports: [
    ...PLANNING_USE_CASES,
    CATEGORY_REPOSITORY,
    MONTH_REPOSITORY,
    LINE_REPOSITORY,
    INCOME_LINE_REPOSITORY,
    CHANGE_LOG,
  ],
})
export class PlanningCoreModule {}
