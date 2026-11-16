import { Injectable } from '@nestjs/common';
import type {
  BudgetExportPort,
  BudgetExportRow,
  BudgetMembershipPort,
} from '../../application/ports/budgets';

/** Placeholder until spec 002 provides the budgets module: nobody has a budget yet. */
@Injectable()
export class NoopBudgetPorts implements BudgetMembershipPort, BudgetExportPort {
  hasAnyBudget(): Promise<boolean> {
    return Promise.resolve(false);
  }
  cancelInvitationsSentBy(): Promise<void> {
    return Promise.resolve();
  }
  finalizeMemberDeletion(): Promise<void> {
    return Promise.resolve();
  }
  previewMemberDeletion() {
    return Promise.resolve({ budgetsDeleted: [], budgetsLeft: [] });
  }
  exportForUser(): Promise<BudgetExportRow> {
    return Promise.resolve({ budgets: [], entries: [] });
  }
}
