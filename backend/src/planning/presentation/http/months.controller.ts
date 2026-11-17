import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Delete,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ChangeStatusRequest,
  CreateIncomeRequest,
  type HistoryResponse,
  type ListMonthsResponse,
  CreateLineRequest,
  CreateMonthRequest,
  LocalDate,
  type MonthDetail,
  ReorderLinesRequest,
  UpdateIncomeRequest,
  UpdateLineRequest,
} from '@two-cents/shared/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import {
  BudgetAccessGuard,
  BudgetId,
  RequirePermission,
} from '../../../budgets/presentation/http/budget-access.guard';
import {
  type AuthContext,
  AuthGuard,
  CurrentAuth,
} from '../../../shared-kernel/presentation/auth.guard';
import {
  ZodBody,
  ZodValidationPipe,
} from '../../../shared-kernel/presentation/zod-validation.pipe';
import { IncomeLines } from '../../application/use-cases/income-lines';
import { Lines } from '../../application/use-cases/lines';
import { ListMonths } from '../../application/use-cases/list-months';
import { CreateMonth, GetMonth } from '../../application/use-cases/months';
import {
  ChangeMonthStatus,
  GetMonthHistory,
} from '../../application/use-cases/status-and-history';

const MonthStart = new ZodValidationPipe(LocalDate);
const Version = new ZodValidationPipe(z.coerce.number().int().min(1));

/** Spec 003 months, lines and incomes (contracts/rest-api.md). Every write returns `MonthDetail`. */
@Controller('budgets/:budgetId/months')
@UseGuards(AuthGuard, BudgetAccessGuard)
export class MonthsController {
  constructor(
    private readonly createMonth: CreateMonth,
    private readonly getMonth: GetMonth,
    private readonly lines: Lines,
    private readonly incomes: IncomeLines,
    private readonly changeStatus: ChangeMonthStatus,
    private readonly history: GetMonthHistory,
    private readonly listMonths: ListMonths,
  ) {}

  /** US7: newest first, 12 per page; `cursor` = the last `start` received. */
  @Get()
  @RequirePermission('budget.read')
  list(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListMonthsResponse> {
    return this.listMonths.execute(
      auth,
      budgetId,
      cursor && LocalDate.safeParse(cursor).success ? cursor : null,
    );
  }

  /** US5: activate, close or reopen. The guard checks read access; the use case the action's permission. */
  @Post(':monthStart/status')
  @HttpCode(200)
  @RequirePermission('budget.read')
  status(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @ZodBody(ChangeStatusRequest) body: z.infer<typeof ChangeStatusRequest>,
  ): Promise<MonthDetail> {
    return this.changeStatus.execute(auth, budgetId, monthStart, body.action);
  }

  @Get(':monthStart/history')
  @RequirePermission('budget.read')
  getHistory(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @Query('cursor') cursor: string | undefined,
    @Query('all') all: string | undefined,
  ): Promise<HistoryResponse> {
    return this.history.execute(auth, budgetId, monthStart, {
      cursor: cursor && /^[0-9a-f-]{36}$/i.test(cursor) ? cursor : null,
      all: all === 'true',
    });
  }

  @Post()
  @RequirePermission('months.create')
  async create(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodBody(CreateMonthRequest) body: z.infer<typeof CreateMonthRequest>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MonthDetail> {
    const detail = await this.createMonth.execute(
      auth,
      budgetId,
      body.periodStart,
      body.source,
    );
    res.status(201);
    return detail;
  }

  /** Polled every 2 s by the app: a matching `If-None-Match` answers 304 before loading lines (R4). */
  @Get(':monthStart')
  @RequirePermission('budget.read')
  async get(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (ifNoneMatch) {
      const revision = await this.getMonth.revision(auth, budgetId, monthStart);
      if (revision !== null && ifNoneMatch === `"${revision}"`) {
        res.setHeader('ETag', `"${revision}"`);
        res.status(304).end();
        return;
      }
    }
    const detail = await this.getMonth.execute(auth, budgetId, monthStart);
    res.setHeader('ETag', `"${detail.month.revision}"`);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.status(200).json(detail);
  }

  @Post(':monthStart/lines')
  @RequirePermission('entries.write')
  async addLine(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @ZodBody(CreateLineRequest) body: z.infer<typeof CreateLineRequest>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MonthDetail> {
    const detail = await this.lines.create(auth, budgetId, monthStart, body);
    res.status(201);
    return detail;
  }

  /** Declared before `lines/:lineId` so `order` is never taken for an id. */
  @Put(':monthStart/lines/order')
  @RequirePermission('entries.write')
  reorder(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @ZodBody(ReorderLinesRequest) body: z.infer<typeof ReorderLinesRequest>,
  ): Promise<MonthDetail> {
    return this.lines.reorder(auth, budgetId, monthStart, body);
  }

  @Patch(':monthStart/lines/:lineId')
  @RequirePermission('entries.write')
  updateLine(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @ZodBody(UpdateLineRequest) body: z.infer<typeof UpdateLineRequest>,
  ): Promise<MonthDetail> {
    return this.lines.update(auth, budgetId, monthStart, lineId, body);
  }

  @Delete(':monthStart/lines/:lineId')
  @RequirePermission('entries.write')
  deleteLine(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Query('expectedVersion', Version) expectedVersion: number,
  ): Promise<MonthDetail> {
    return this.lines.remove(
      auth,
      budgetId,
      monthStart,
      lineId,
      expectedVersion,
    );
  }

  @Post(':monthStart/incomes')
  @RequirePermission('income.write.own')
  async addIncome(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @ZodBody(CreateIncomeRequest) body: z.infer<typeof CreateIncomeRequest>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MonthDetail> {
    const detail = await this.incomes.add(auth, budgetId, monthStart, body);
    res.status(201);
    return detail;
  }

  /** Declared before `incomes/:incomeId`. US2: confirms the caller's pre-filled incomes (FR-006). */
  @Post(':monthStart/incomes/confirm')
  @HttpCode(200)
  @RequirePermission('income.write.own')
  confirmIncomes(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
  ): Promise<MonthDetail> {
    return this.incomes.confirm(auth, budgetId, monthStart);
  }

  @Patch(':monthStart/incomes/:incomeId')
  @RequirePermission('income.write.own')
  updateIncome(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @Param('incomeId', ParseUUIDPipe) incomeId: string,
    @ZodBody(UpdateIncomeRequest) body: z.infer<typeof UpdateIncomeRequest>,
  ): Promise<MonthDetail> {
    return this.incomes.update(auth, budgetId, monthStart, incomeId, body);
  }

  @Delete(':monthStart/incomes/:incomeId')
  @RequirePermission('income.write.own')
  deleteIncome(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @Param('incomeId', ParseUUIDPipe) incomeId: string,
    @Query('expectedVersion', Version) expectedVersion: number,
  ): Promise<MonthDetail> {
    return this.incomes.remove(
      auth,
      budgetId,
      monthStart,
      incomeId,
      expectedVersion,
    );
  }
}
