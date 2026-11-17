import { Controller, Post, Res, UseGuards } from '@nestjs/common';
import {
  type ImportCommitResponse,
  type ImportPreviewResult,
  ImportRequest,
} from '@two-cents/shared/contracts';
import type { Response } from 'express';
import type { z } from 'zod';
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
import { ZodBody } from '../../../shared-kernel/presentation/zod-validation.pipe';
import { ImportMonths } from '../../application/use-cases/import-months';

/** Spec 003 US8: spreadsheet import (contracts/rest-api.md "Import"). */
@Controller('budgets/:budgetId/imports')
@UseGuards(AuthGuard, BudgetAccessGuard)
export class ImportsController {
  constructor(private readonly importMonths: ImportMonths) {}

  @Post()
  @RequirePermission('entries.write')
  async create(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodBody(ImportRequest) body: z.infer<typeof ImportRequest>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ImportPreviewResult | ImportCommitResponse> {
    const result = await this.importMonths.execute(auth, budgetId, body);
    res.status(body.dryRun ? 200 : 201);
    return result;
  }
}
