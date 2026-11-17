import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  type BudgetDetail,
  ChangeRoleRequest,
  EventsQuery,
  type EventsResponse,
  LocalDate,
  type MembersResponse,
  type MemberView,
  type Money,
  PutIncomeRequest,
  TransferOwnershipRequest,
} from '@two-cents/shared/contracts';
import type { z } from 'zod';
import {
  type AuthContext,
  AuthGuard,
  CurrentAuth,
} from '../../../shared-kernel/presentation/auth.guard';
import {
  ZodBody,
  ZodQuery,
  ZodValidationPipe,
} from '../../../shared-kernel/presentation/zod-validation.pipe';
import { UpsertPrimaryIncome } from '../../../planning/application/use-cases/income-lines';
import {
  ChangeRole,
  LeaveBudget,
  ListEvents,
  ListMembers,
  RemoveMember,
  TransferOwnership,
} from '../../application/use-cases/members';
import {
  BudgetAccessGuard,
  BudgetId,
  RequirePermission,
} from './budget-access.guard';

/** US5 and income: people in a budget (contracts/rest-api.md "Members", "Income"). */
@Controller('budgets/:budgetId')
@UseGuards(AuthGuard, BudgetAccessGuard)
export class MembersController {
  constructor(
    private readonly listMembers: ListMembers,
    private readonly changeRole: ChangeRole,
    private readonly removeMember: RemoveMember,
    private readonly transfer: TransferOwnership,
    private readonly leaveBudget: LeaveBudget,
    private readonly listEvents: ListEvents,
    private readonly upsertPrimaryIncome: UpsertPrimaryIncome,
  ) {}

  @Get('members')
  @RequirePermission('budget.read')
  list(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
  ): Promise<MembersResponse> {
    return this.listMembers.execute(auth, budgetId);
  }

  /** Declared before `members/:membershipId` so `me` is never taken for an id. */
  @Put('members/me/income/:monthStart')
  @RequirePermission('income.write.own')
  putIncome(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', new ZodValidationPipe(LocalDate)) monthStart: string,
    @ZodBody(PutIncomeRequest) body: z.infer<typeof PutIncomeRequest>,
  ): Promise<Money> {
    return this.upsertPrimaryIncome.execute(
      auth,
      budgetId,
      monthStart,
      body.amountMinor,
    );
  }

  @Patch('members/:membershipId')
  @RequirePermission('members.manage')
  setRole(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @ZodBody(ChangeRoleRequest) body: z.infer<typeof ChangeRoleRequest>,
  ): Promise<MemberView> {
    return this.changeRole.execute(auth, budgetId, membershipId, body.role);
  }

  @Delete('members/:membershipId')
  @HttpCode(204)
  @RequirePermission('members.manage')
  async remove(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ): Promise<void> {
    await this.removeMember.execute(auth, budgetId, membershipId);
  }

  @Post('ownership')
  @HttpCode(200)
  @RequirePermission('ownership.transfer')
  transferOwnership(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodBody(TransferOwnershipRequest)
    body: z.infer<typeof TransferOwnershipRequest>,
  ): Promise<BudgetDetail> {
    return this.transfer.execute(auth, budgetId, body.toMembershipId);
  }

  /** Any current person may call it; the owner gets 409 OWNER_MUST_TRANSFER (FR-030). */
  @Post('leave')
  @HttpCode(204)
  @RequirePermission('budget.read')
  async leave(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
  ): Promise<void> {
    await this.leaveBudget.execute(auth, budgetId);
  }

  @Get('events')
  @RequirePermission('members.manage')
  events(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodQuery(EventsQuery) query: z.infer<typeof EventsQuery>,
  ): Promise<EventsResponse> {
    return this.listEvents.execute(auth, budgetId, query.cursor);
  }
}
