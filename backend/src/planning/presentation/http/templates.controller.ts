import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateTemplateRequest,
  type ListTemplatesResponse,
  RenameTemplateRequest,
  type TemplateSummary,
} from '@two-cents/shared/contracts';
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
import { Templates } from '../../application/use-cases/templates';

/** Spec 003 US2: month templates (contracts/rest-api.md "Templates"). */
@Controller('budgets/:budgetId/templates')
@UseGuards(AuthGuard, BudgetAccessGuard)
export class TemplatesController {
  constructor(private readonly templates: Templates) {}

  @Get()
  @RequirePermission('budget.read')
  async list(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
  ): Promise<ListTemplatesResponse> {
    return { templates: await this.templates.list(auth, budgetId) };
  }

  @Post()
  @RequirePermission('entries.write')
  create(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodBody(CreateTemplateRequest) body: z.infer<typeof CreateTemplateRequest>,
  ): Promise<TemplateSummary> {
    return this.templates.save(auth, budgetId, body.name, body.fromMonthStart);
  }

  @Patch(':templateId')
  @RequirePermission('entries.write')
  rename(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @ZodBody(RenameTemplateRequest) body: z.infer<typeof RenameTemplateRequest>,
  ): Promise<TemplateSummary> {
    return this.templates.rename(auth, budgetId, templateId, body.name);
  }

  @Delete(':templateId')
  @HttpCode(204)
  @RequirePermission('entries.write')
  remove(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ): Promise<void> {
    return this.templates.remove(auth, budgetId, templateId);
  }
}
