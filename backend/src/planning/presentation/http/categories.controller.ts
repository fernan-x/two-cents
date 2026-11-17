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
  type Category,
  CreateCategoryRequest,
  type ListCategoriesResponse,
  UpdateCategoryRequest,
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
import { Categories } from '../../application/use-cases/categories';

/** Spec 003 US3: categories (contracts/rest-api.md "Categories"). */
@Controller('budgets/:budgetId/categories')
@UseGuards(AuthGuard, BudgetAccessGuard)
export class CategoriesController {
  constructor(private readonly categories: Categories) {}

  @Get()
  @RequirePermission('budget.read')
  async list(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
  ): Promise<ListCategoriesResponse> {
    return { categories: await this.categories.list(auth, budgetId) };
  }

  @Post()
  @RequirePermission('entries.write')
  create(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodBody(CreateCategoryRequest) body: z.infer<typeof CreateCategoryRequest>,
  ): Promise<Category> {
    return this.categories.create(auth, budgetId, body.name);
  }

  @Patch(':categoryId')
  @RequirePermission('entries.write')
  update(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @ZodBody(UpdateCategoryRequest) body: z.infer<typeof UpdateCategoryRequest>,
  ): Promise<Category> {
    return this.categories.update(auth, budgetId, categoryId, body);
  }

  @Delete(':categoryId')
  @HttpCode(204)
  @RequirePermission('entries.write')
  remove(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<void> {
    return this.categories.remove(auth, budgetId, categoryId);
  }
}
