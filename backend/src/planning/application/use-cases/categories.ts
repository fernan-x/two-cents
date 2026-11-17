import { Inject, Injectable } from '@nestjs/common';
import type { Category, CategorySystemKey } from '@two-cents/shared/contracts';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import {
  ID_GENERATOR,
  type IdGenerator,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  CATEGORY_REPOSITORY,
  type CategoryRecord,
  type CategoryRepository,
} from '../../domain/ports/repositories';

const view = (c: CategoryRecord): Category => ({
  id: c.id,
  systemKey: c.systemKey as CategorySystemKey | null,
  name: c.name,
  position: c.position,
});

/**
 * US3: the per-budget category list (FR-014). Budgets start with 10 defaults (seeded by a database
 * trigger, migration 0006); deleting a category leaves its lines uncategorized (FK set null).
 */
@Injectable()
export class Categories {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async list(auth: AuthContext, budgetId: string): Promise<Category[]> {
    await this.access.require(budgetId, auth.userId, 'budget.read');
    return (await this.categories.list(budgetId)).map(view);
  }

  create(auth: AuthContext, budgetId: string, name: string): Promise<Category> {
    return this.tx.run(async () => {
      await this.access.require(budgetId, auth.userId, 'entries.write', {
        forUpdate: true,
      });
      if (await this.categories.nameTaken(budgetId, name))
        throw new DomainError('VALIDATION_FAILED', {
          issues: [{ path: ['name'], message: 'name taken' }],
        });
      const all = await this.categories.list(budgetId);
      const record: CategoryRecord = {
        id: this.ids.next(),
        budgetId,
        systemKey: null,
        name,
        position: all.reduce((max, c) => Math.max(max, c.position + 1), 0),
      };
      await this.categories.save(record);
      return view(record);
    });
  }

  update(
    auth: AuthContext,
    budgetId: string,
    id: string,
    input: { name?: string; position?: number },
  ): Promise<Category> {
    return this.tx.run(async () => {
      await this.access.require(budgetId, auth.userId, 'entries.write', {
        forUpdate: true,
      });
      const category = await this.categories.findById(budgetId, id);
      if (!category) throw new DomainError('NOT_FOUND');
      if (
        input.name !== undefined &&
        (await this.categories.nameTaken(budgetId, input.name, id))
      )
        throw new DomainError('VALIDATION_FAILED', {
          issues: [{ path: ['name'], message: 'name taken' }],
        });
      const updated = {
        ...category,
        name: input.name ?? category.name,
        position: input.position ?? category.position,
      };
      await this.categories.save(updated);
      return view(updated);
    });
  }

  remove(auth: AuthContext, budgetId: string, id: string): Promise<void> {
    return this.tx.run(async () => {
      await this.access.require(budgetId, auth.userId, 'entries.write');
      if (!(await this.categories.findById(budgetId, id)))
        throw new DomainError('NOT_FOUND');
      await this.categories.delete(id);
    });
  }
}
