import { Module } from '@nestjs/common';
import { PlanningCoreModule } from '../planning/planning-core.module';
import { BudgetsCoreModule } from './budgets-core.module';
import { BudgetAccessGuard } from './presentation/http/budget-access.guard';
import {
  BudgetsController,
  MyBudgetsController,
} from './presentation/http/budgets.controller';
import {
  InvitationsController,
  InviteeInvitationsController,
  PushDevicesController,
} from './presentation/http/invitations.controller';
import { InvitePageController } from './infrastructure/invite-page/invite-page.controller';
import { MembersController } from './presentation/http/members.controller';

/** Spec 002: shared budgets and membership. AuthGuard comes from the global IdentityModule. */
@Module({
  imports: [BudgetsCoreModule, PlanningCoreModule],
  controllers: [
    BudgetsController,
    MyBudgetsController,
    MembersController,
    InvitationsController,
    InviteeInvitationsController,
    PushDevicesController,
    InvitePageController,
  ],
  providers: [BudgetAccessGuard],
})
export class BudgetsModule {}
