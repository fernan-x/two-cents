import { Module, type Provider } from '@nestjs/common';
import {
  INVITATION_LINKS,
  INVITE_CODES,
  USER_DIRECTORY,
} from './application/ports';
import { BudgetAccess } from './application/services/budget-access';
import { BudgetViews } from './application/services/budget-views';
import { MembershipEvents } from './application/services/membership-events';
import { MembershipHooks } from './application/services/membership-hooks';
import { AccountHandoff } from './application/use-cases/account-handoff';
import {
  CreateBudget,
  DeleteBudget,
  GetBudget,
  ListMyBudgets,
  OpenBudget,
  PurgeBudgets,
  RestoreBudget,
  UpdateBudgetSettings,
} from './application/use-cases/budgets';
import {
  CreateInvitation,
  ExpireInvitations,
  InvitationSender,
  ListInvitations,
  ResendInvitation,
  RevokeInvitation,
} from './application/use-cases/invitations';
import {
  AcceptInvitation,
  DeclineInvitation,
  InvitationLookup,
  PreviewInvitation,
} from './application/use-cases/joining';
import {
  ChangeRole,
  LeaveBudget,
  ListEvents,
  ListMembers,
  MonthParticipants,
  RemoveMember,
  TransferOwnership,
} from './application/use-cases/members';
import {
  RegisterPushDevice,
  UnregisterPushDevice,
} from './application/use-cases/push-devices';
import {
  BUDGET_REPOSITORY,
  INCOME_REPOSITORY,
  INVITATION_REPOSITORY,
  INVITE_CODE_FAILURE_LOG,
  MEMBERSHIP_EVENT_LOG,
  MEMBERSHIP_REPOSITORY,
  PUSH_DEVICE_REPOSITORY,
} from './domain/ports/repositories';
import {
  AppInvitationLinks,
  DrizzleUserDirectory,
  HmacInviteCodes,
} from './infrastructure/adapters';
import { BudgetJobs } from './infrastructure/jobs/budget-jobs';
import { BudgetNotificationsHandler } from './infrastructure/notifications/budget-notifications.handler';
import { DrizzleBudgetRepository } from './infrastructure/persistence/drizzle-budget.repository';
import { DrizzleInvitationRepository } from './infrastructure/persistence/drizzle-invitation.repository';
import { DrizzleMembershipRepository } from './infrastructure/persistence/drizzle-membership.repository';
import {
  DrizzleIncomeRepository,
  DrizzleInviteCodeFailureLog,
  DrizzleMembershipEventLog,
  DrizzlePushDeviceRepository,
} from './infrastructure/persistence/drizzle-other.repositories';

const adapters: Provider[] = [
  { provide: BUDGET_REPOSITORY, useClass: DrizzleBudgetRepository },
  { provide: MEMBERSHIP_REPOSITORY, useClass: DrizzleMembershipRepository },
  { provide: INVITATION_REPOSITORY, useClass: DrizzleInvitationRepository },
  { provide: INCOME_REPOSITORY, useClass: DrizzleIncomeRepository },
  { provide: MEMBERSHIP_EVENT_LOG, useClass: DrizzleMembershipEventLog },
  { provide: PUSH_DEVICE_REPOSITORY, useClass: DrizzlePushDeviceRepository },
  { provide: INVITE_CODE_FAILURE_LOG, useClass: DrizzleInviteCodeFailureLog },
  { provide: USER_DIRECTORY, useClass: DrizzleUserDirectory },
  { provide: INVITE_CODES, useClass: HmacInviteCodes },
  { provide: INVITATION_LINKS, useClass: AppInvitationLinks },
  BudgetNotificationsHandler,
  BudgetJobs,
];

const useCases: Provider[] = [
  BudgetAccess,
  BudgetViews,
  MembershipEvents,
  MembershipHooks,
  InvitationSender,
  InvitationLookup,
  CreateBudget,
  GetBudget,
  ListMyBudgets,
  OpenBudget,
  UpdateBudgetSettings,
  DeleteBudget,
  RestoreBudget,
  PurgeBudgets,
  CreateInvitation,
  ListInvitations,
  ResendInvitation,
  RevokeInvitation,
  ExpireInvitations,
  PreviewInvitation,
  AcceptInvitation,
  DeclineInvitation,
  ListMembers,
  ChangeRole,
  RemoveMember,
  LeaveBudget,
  TransferOwnership,
  ListEvents,
  MonthParticipants,
  RegisterPushDevice,
  UnregisterPushDevice,
  AccountHandoff,
];

/**
 * The budgets context without its HTTP layer (research R15). Spec 001's IdentityModule imports it for
 * the account-deletion and export ports, so it must not depend on IdentityModule itself.
 */
@Module({
  providers: [...adapters, ...useCases],
  // Spec 003's planning module reads budgets and memberships through these ports.
  exports: [...useCases, BUDGET_REPOSITORY, MEMBERSHIP_REPOSITORY],
})
export class BudgetsCoreModule {}
