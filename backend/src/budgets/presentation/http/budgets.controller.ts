import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type BudgetDetail,
  CreateBudgetRequest,
  DeleteBudgetRequest,
  type MyBudgetsResponse,
  UpdateBudgetRequest,
} from '@two-cents/shared/contracts';
import type { z } from 'zod';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  type AuthContext,
  AuthGuard,
  CurrentAuth,
} from '../../../shared-kernel/presentation/auth.guard';
import { ZodBody } from '../../../shared-kernel/presentation/zod-validation.pipe';
import {
  CreateBudget,
  DeleteBudget,
  GetBudget,
  ListMyBudgets,
  OpenBudget,
  RestoreBudget,
  UpdateBudgetSettings,
} from '../../application/use-cases/budgets';
import {
  BudgetAccessGuard,
  BudgetId,
  RequirePermission,
} from './budget-access.guard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** US1, US3, US6: budgets (contracts/rest-api.md "Budgets"). */
@Controller('budgets')
@UseGuards(AuthGuard)
export class BudgetsController {
  constructor(
    private readonly createBudget: CreateBudget,
    private readonly getBudget: GetBudget,
    private readonly openBudget: OpenBudget,
    private readonly updateSettings: UpdateBudgetSettings,
    private readonly deleteBudget: DeleteBudget,
    private readonly restoreBudget: RestoreBudget,
  ) {}

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(CreateBudgetRequest) body: z.infer<typeof CreateBudgetRequest>,
  ): Promise<BudgetDetail> {
    return this.createBudget.execute(auth, body);
  }

  @Get(':budgetId')
  @UseGuards(BudgetAccessGuard)
  @RequirePermission('budget.read')
  get(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
  ): Promise<BudgetDetail> {
    return this.getBudget.execute(auth, budgetId);
  }

  @Post(':budgetId/open')
  @HttpCode(204)
  @UseGuards(BudgetAccessGuard)
  @RequirePermission('budget.read')
  async open(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
  ): Promise<void> {
    await this.openBudget.execute(auth, budgetId);
  }

  @Patch(':budgetId')
  @UseGuards(BudgetAccessGuard)
  @RequirePermission('budget.settings.edit')
  update(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodBody(UpdateBudgetRequest) body: z.infer<typeof UpdateBudgetRequest>,
  ): Promise<BudgetDetail> {
    return this.updateSettings.execute(auth, budgetId, body);
  }

  @Delete(':budgetId')
  @HttpCode(204)
  @UseGuards(BudgetAccessGuard)
  @RequirePermission('budget.delete')
  async delete(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodBody(DeleteBudgetRequest) body: z.infer<typeof DeleteBudgetRequest>,
  ): Promise<void> {
    await this.deleteBudget.execute(auth, budgetId, body.confirmName);
  }

  /**
   * The only budget route that works on a deleted budget (FR-038a), so it can't use
   * BudgetAccessGuard: the use case answers 404 unless the caller deleted it as owner < 30 days ago.
   */
  @Post(':budgetId/restore')
  @HttpCode(200)
  restore(
    @CurrentAuth() auth: AuthContext,
    @Param('budgetId') budgetId: string,
  ): Promise<BudgetDetail> {
    if (!UUID.test(budgetId)) throw new DomainError('BUDGET_NOT_FOUND');
    return this.restoreBudget.execute(auth, budgetId);
  }
}

/** US3: the picker's list (FR-035). */
@Controller('me/budgets')
@UseGuards(AuthGuard)
export class MyBudgetsController {
  constructor(private readonly listMyBudgets: ListMyBudgets) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext): Promise<MyBudgetsResponse> {
    return this.listMyBudgets.execute(auth);
  }
}
