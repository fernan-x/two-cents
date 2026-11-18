import { Module, type Provider } from '@nestjs/common';
import { BudgetsCoreModule } from '../budgets/budgets-core.module';
import { BudgetAccessGuard } from '../budgets/presentation/http/budget-access.guard';
import { PlanningCoreModule } from '../planning/planning-core.module';
import { TrackingHooks } from './application/services/tracking-hooks';
import { TrackingViews } from './application/services/tracking-views';
import { TxnWriter } from './application/services/txn-writer';
import { GetHints } from './application/use-cases/get-hints';
import { GetTracking } from './application/use-cases/get-tracking';
import { ImportTransactions } from './application/use-cases/import-transactions';
import { Receipts } from './application/use-cases/receipts';
import {
  MaterializeRecurring,
  RecurringRules,
} from './application/use-cases/recurring';
import { Settlements } from './application/use-cases/settlements';
import { Transactions } from './application/use-cases/transactions';
import {
  CSV_MAPPING_REPOSITORY,
  RECEIPT_STORE,
  RECURRING_RULE_REPOSITORY,
  SETTLEMENT_REPOSITORY,
  SUGGESTION_STATS,
  TRANSACTION_REPOSITORY,
} from './domain/ports/repositories';
import {
  DrizzleCsvMappingRepository,
  DrizzleReceiptStore,
  DrizzleRecurringRuleRepository,
  DrizzleSettlementRepository,
  DrizzleSuggestionStats,
} from './infrastructure/persistence/drizzle-other.repositories';
import { DrizzleTransactionRepository } from './infrastructure/persistence/drizzle-transaction.repository';
import { TrackingExportContributor } from './infrastructure/export/tracking-export.contributor';
import { RecurringJob } from './infrastructure/jobs/recurring.job';
import { TrackingExtrasController } from './presentation/http/tracking-extras.controller';
import { TransactionsController } from './presentation/http/transactions.controller';

const adapters: Provider[] = [
  { provide: TRANSACTION_REPOSITORY, useClass: DrizzleTransactionRepository },
  { provide: RECEIPT_STORE, useClass: DrizzleReceiptStore },
  { provide: SETTLEMENT_REPOSITORY, useClass: DrizzleSettlementRepository },
  {
    provide: RECURRING_RULE_REPOSITORY,
    useClass: DrizzleRecurringRuleRepository,
  },
  { provide: CSV_MAPPING_REPOSITORY, useClass: DrizzleCsvMappingRepository },
  { provide: SUGGESTION_STATS, useClass: DrizzleSuggestionStats },
];

/** Spec 004: transaction tracking. Depends on planning through its core module and hooks only. */
@Module({
  imports: [BudgetsCoreModule, PlanningCoreModule],
  controllers: [TransactionsController, TrackingExtrasController],
  providers: [
    ...adapters,
    BudgetAccessGuard,
    TxnWriter,
    TrackingViews,
    TrackingHooks,
    Transactions,
    GetTracking,
    GetHints,
    Receipts,
    Settlements,
    RecurringRules,
    MaterializeRecurring,
    RecurringJob,
    ImportTransactions,
    TrackingExportContributor,
  ],
})
export class TrackingModule {}
