import {
  Body,
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
  CsvMapping,
  LocalDate,
  RecurringRuleCreate,
  type RecurringRuleList,
  RecurringRulePatch,
  type RecurringRuleView,
  SettlementCreate,
  type SettlementView,
  type TransactionImportResult,
  TransactionImportRequest,
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
import { GetHints } from '../../application/use-cases/get-hints';
import { ImportTransactions } from '../../application/use-cases/import-transactions';
import { Receipts } from '../../application/use-cases/receipts';
import { RecurringRules } from '../../application/use-cases/recurring';
import { Settlements } from '../../application/use-cases/settlements';

const MonthStart = new ZodValidationPipe(LocalDate);
const Version = new ZodValidationPipe(z.coerce.number().int().min(1));
const Fingerprint = new ZodValidationPipe(z.string().min(1).max(500));

/** Spec 004 US4, US5 (receipts), US6, US8, US9 (contracts/rest-api.md). */
@Controller('budgets/:budgetId')
@UseGuards(AuthGuard, BudgetAccessGuard)
export class TrackingExtrasController {
  constructor(
    private readonly hints: GetHints,
    private readonly receipts: Receipts,
    private readonly settlements: Settlements,
    private readonly recurring: RecurringRules,
    private readonly imports: ImportTransactions,
  ) {}

  @Get('transaction-hints')
  @RequirePermission('transactions.read')
  async getHints(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { etag, hints } = await this.hints.execute(auth, budgetId);
    res.setHeader('ETag', `"${etag}"`);
    res.setHeader('Cache-Control', 'private, no-cache');
    if (ifNoneMatch === `"${etag}"`) {
      res.status(304).end();
      return;
    }
    res.status(200).json(hints);
  }

  @Put('transactions/:txnId/receipts/:receiptId')
  @RequirePermission('transactions.write')
  async putReceipt(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('txnId', ParseUUIDPipe) txnId: string,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ id: string }> {
    const created = await this.receipts.put(
      auth,
      budgetId,
      txnId,
      receiptId,
      Buffer.isBuffer(body) ? body : undefined,
    );
    res.status(created ? 201 : 200);
    return { id: receiptId };
  }

  @Get('transactions/:txnId/receipts/:receiptId')
  @RequirePermission('transactions.read')
  async getReceipt(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('txnId', ParseUUIDPipe) txnId: string,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
    @Res() res: Response,
  ): Promise<void> {
    const bytes = await this.receipts.get(auth, budgetId, txnId, receiptId);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.status(200).end(bytes);
  }

  @Delete('transactions/:txnId/receipts/:receiptId')
  @HttpCode(204)
  @RequirePermission('transactions.write')
  async deleteReceipt(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('txnId', ParseUUIDPipe) txnId: string,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
  ): Promise<void> {
    await this.receipts.remove(auth, budgetId, txnId, receiptId);
  }

  @Post('months/:monthStart/settlements')
  @RequirePermission('transactions.write')
  async settle(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('monthStart', MonthStart) monthStart: string,
    @ZodBody(SettlementCreate) body: z.infer<typeof SettlementCreate>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SettlementView> {
    const view = await this.settlements.create(
      auth,
      budgetId,
      monthStart,
      body,
    );
    res.status(201);
    return view;
  }

  @Get('recurring-transactions')
  @RequirePermission('transactions.read')
  async listRules(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
  ): Promise<RecurringRuleList> {
    return { rules: await this.recurring.list(auth, budgetId) };
  }

  @Post('recurring-transactions')
  @RequirePermission('transactions.write')
  async createRule(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodBody(RecurringRuleCreate) body: z.infer<typeof RecurringRuleCreate>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RecurringRuleView> {
    const view = await this.recurring.create(auth, budgetId, body);
    res.status(201);
    return view;
  }

  @Patch('recurring-transactions/:ruleId')
  @RequirePermission('transactions.write')
  patchRule(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @ZodBody(RecurringRulePatch) body: z.infer<typeof RecurringRulePatch>,
  ): Promise<RecurringRuleView> {
    return this.recurring.patch(auth, budgetId, ruleId, body);
  }

  @Delete('recurring-transactions/:ruleId')
  @HttpCode(204)
  @RequirePermission('transactions.write')
  async deleteRule(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Query('expectedVersion', Version) expectedVersion: number,
  ): Promise<void> {
    await this.recurring.remove(auth, budgetId, ruleId, expectedVersion);
  }

  @Get('csv-mappings/:fingerprint')
  @RequirePermission('transactions.read')
  getMapping(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('fingerprint', Fingerprint) fingerprint: string,
  ): Promise<CsvMapping> {
    return this.imports.getMapping(auth, budgetId, fingerprint);
  }

  @Put('csv-mappings/:fingerprint')
  @RequirePermission('transactions.write')
  putMapping(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('fingerprint', Fingerprint) fingerprint: string,
    @ZodBody(CsvMapping) body: CsvMapping,
  ): Promise<CsvMapping> {
    return this.imports.putMapping(auth, budgetId, fingerprint, body);
  }

  @Post('transaction-imports')
  @RequirePermission('transactions.write')
  async importRows(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodBody(TransactionImportRequest)
    body: z.infer<typeof TransactionImportRequest>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionImportResult> {
    const result = await this.imports.execute(auth, budgetId, body);
    res.status(body.dryRun ? 200 : 201);
    return result;
  }
}
