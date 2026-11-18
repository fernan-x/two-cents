import { Injectable, type OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  type BudgetExportContributor,
  BudgetExportContributors,
  type ExportContribution,
} from '../../../budgets/application/services/export-contributors';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';

/**
 * Spec 004 R15 (Principle III): adds transactions, settlements, recurring rules and receipt photos
 * of the user's current budgets to the GDPR export. Other members' private-line transactions and
 * their receipts are left out, as everywhere else (FR-048).
 */
@Injectable()
export class TrackingExportContributor
  implements BudgetExportContributor, OnModuleInit
{
  constructor(
    private readonly registry: BudgetExportContributors,
    private readonly db: DrizzleTransactionRunner,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async contribute(
    memberships: ReadonlyArray<{
      budgetId: string;
      budgetName: string | null;
      membershipId: string;
    }>,
  ): Promise<ExportContribution> {
    const out: ExportContribution = {
      sections: { transactions: [], settlements: [], recurring_rules: [] },
      files: [],
    };
    const exec = this.db.executor();
    for (const m of memberships) {
      // A transaction is hidden when any of its parts sits on another member's private line.
      const hidden = sql`EXISTS (SELECT 1 FROM txn_part hp JOIN budget_line hl ON hl.id = hp.line_id
        WHERE hp.txn_id = t.id AND hl.is_private AND hl.owner_membership_id <> ${m.membershipId})`;
      const txns = await exec.execute<
        Record<string, string | boolean | null>
      >(sql`
        SELECT t.id, t.date::text AS date, t.amount_minor::text AS amount_minor, t.currency, t.label,
               coalesce(t.payer_membership_id::text, 'joint') AS payer, t.payment_method, t.is_planned,
               t.is_shared, t.note, t.origin,
               (SELECT string_agg(coalesce(bl.label, '-') || '=' || p.amount_minor::text, ' | ' ORDER BY p.position)
                  FROM txn_part p LEFT JOIN budget_line bl ON bl.id = p.line_id WHERE p.txn_id = t.id) AS lines
        FROM txn t WHERE t.budget_id = ${m.budgetId} AND NOT ${hidden} ORDER BY t.date, t.created_at`);
      for (const r of txns.rows)
        out.sections.transactions.push({ budgetName: m.budgetName, ...r });

      const settlements = await exec.execute<Record<string, string>>(sql`
        SELECT s.id, bm.period_start::text AS month, s.from_membership_id::text AS "from",
               s.to_membership_id::text AS "to", s.amount_minor::text AS amount_minor, s.created_at::text AS created_at
        FROM settlement s JOIN budget_month bm ON bm.id = s.month_id WHERE s.budget_id = ${m.budgetId}`);
      for (const r of settlements.rows)
        out.sections.settlements.push({ budgetName: m.budgetName, ...r });

      const rules = await exec.execute<
        Record<string, string | number | boolean | null>
      >(sql`
        SELECT id, label, amount_minor::text AS amount_minor, currency, day_of_month,
               coalesce(payer_membership_id::text, 'joint') AS payer, payment_method, active, starts_on::text AS starts_on
        FROM recurring_txn_rule WHERE budget_id = ${m.budgetId}`);
      for (const r of rules.rows)
        out.sections.recurring_rules.push({ budgetName: m.budgetName, ...r });

      const receipts = await exec.execute<{
        id: string;
        txn_id: string;
        bytes: Buffer;
      }>(sql`
        SELECT r.id, r.txn_id, r.bytes FROM txn_receipt r JOIN txn t ON t.id = r.txn_id
        WHERE t.budget_id = ${m.budgetId} AND NOT ${hidden}`);
      for (const r of receipts.rows)
        out.files.push({
          path: `receipts/${r.txn_id}/${r.id}.jpg`,
          bytes: new Uint8Array(r.bytes),
        });
    }
    return out;
  }
}
