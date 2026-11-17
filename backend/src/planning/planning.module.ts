import { Module } from '@nestjs/common';
import { BudgetsCoreModule } from '../budgets/budgets-core.module';
import { BudgetAccessGuard } from '../budgets/presentation/http/budget-access.guard';
import { PlanningCoreModule } from './planning-core.module';
import { MonthsController } from './presentation/http/months.controller';
import { TemplatesController } from './presentation/http/templates.controller';
import { CategoriesController } from './presentation/http/categories.controller';
import { ImportsController } from './presentation/http/imports.controller';

/** Spec 003: monthly budget planning (HTTP layer). AuthGuard comes from the global IdentityModule. */
@Module({
  imports: [BudgetsCoreModule, PlanningCoreModule],
  controllers: [
    MonthsController,
    TemplatesController,
    CategoriesController,
    ImportsController,
  ],
  providers: [BudgetAccessGuard],
})
export class PlanningModule {}
