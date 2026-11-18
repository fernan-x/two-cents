import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  LocalDate,
  PaidAsPlannedRequest,
  type TrackingView,
  TransactionCreate,
  TransactionPatch,
  type TransactionView,
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
import { GetTracking } from '../../application/use-cases/get-tracking';
import { Transactions } from '../../application/use-cases/transactions';

const MonthStart = new ZodValidationPipe(LocalDate);
const Version = new ZodValidationPipe(z.coerce.number().int().min(1));

/** Answers 304 when the month revision matches `If-None-Match` (research R4). */
async function withEtag<T extends { revision: string }>(
  res: Response,
  ifNoneMatch: string | undefined,
  revision: () => Promise<string | null>,
  load: () => Promise<T>,
): Promise<void> {
  if (ifNoneMatch) {
    const current = await revision();
    if (current !== null && ifNoneMatch === `"${current}"`) {
      res.setHeader('ETag', `"${current}"`);
      res.status(304).end();
      return;
    }
  }
  const body = await load();
  res.setHeader('ETag', `"${body.revision}"`);
  res.setHeader('Cache-Control', 'private, no-cache');
  res.status(200).json(body);
}

/** Spec 004 transactions and tracking (contracts/rest-api.md). */
@Controller('budgets/:budgetId')
@UseGuards(AuthGuard, BudgetAccessGuard)
export class TransactionsController {
  constructor(
    private readonly transactions: Transactions,
    private readonly tracking: GetTracking,
  ) {}

  /** Idempotent create by client id: 201 the first time, 200 on an identical replay (R3). */
  @Put('transactions/:txnId')
  @RequirePermission('transactions.write')
  async put(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('txnId', ParseUUIDPipe) txnId: string,
    @ZodBody(TransactionCreate) body: z.infer<typeof TransactionCreate>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionView> {
    const { created, view } = await this.transactions.put(
      auth,
      budgetId,
      txnId,
      body,
    );
    res.status(created ? 201 : 200);
    return view;
  }

  @Patch('transactions/:txnId')
  @RequirePermission('transactions.write')
  patch(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('txnId', ParseUUIDPipe) txnId: string,
    @ZodBody(TransactionPatch) body: z.infer<typeof TransactionPatch>,
  ): Promise<TransactionView> {
    return this.transactions.patch(auth, budgetId, txnId, body);
  }

  @Delete('transactions/:txnId')
  @HttpCode(204)
  @RequirePermission('transactions.write')
  async remove(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('txnId', ParseUUIDPipe) txnId: string,
    @Query('expectedVersion', Version) expectedVersion: number,
  ): Promise<void> {
    await this.transactions.remove(auth, budgetId, txnId, expectedVersion);
  }

  @Get('months/:monthStart/transactions')
  @RequirePermission('transactions.read')
  list(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    return withEtag(
      res,
      ifNoneMatch,
      () => this.transactions.revision(auth, budgetId, monthStart),
      () => this.transactions.list(auth, budgetId, monthStart),
    );
  }

  @Get('months/:monthStart/tracking')
  @RequirePermission('transactions.read')
  getTracking(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    return withEtag<TrackingView>(
      res,
      ifNoneMatch,
      () => this.transactions.revision(auth, budgetId, monthStart),
      () => this.tracking.execute(auth, budgetId, monthStart),
    );
  }

  @Post('months/:monthStart/lines/:lineId/paid-as-planned')
  @RequirePermission('transactions.write')
  async paidAsPlanned(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @ZodBody(PaidAsPlannedRequest) body: z.infer<typeof PaidAsPlannedRequest>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionView> {
    const { created, view } = await this.transactions.paidAsPlanned(
      auth,
      budgetId,
      monthStart,
      lineId,
      body.txnId,
    );
    res.status(created ? 201 : 200);
    return view;
  }
}
