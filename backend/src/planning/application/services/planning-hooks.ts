import { Injectable } from '@nestjs/common';
import type { MonthContext } from './month-writer';

export interface PlanningHandler {
  /** Before a budget line is deleted, inside its transaction (spec 004 FR-045). */
  lineDeleting?(lineId: string): Promise<void>;
  /** After a month is created or filled, inside its transaction (spec 004 FR-037). */
  monthCreated?(ctx: MonthContext): Promise<void>;
}

/**
 * Lets later features react to planning events without planning depending on them: spec 004's
 * tracking module registers itself here at startup (transactions of a deleted line become
 * unassigned; missed recurring transactions are created with a new month).
 */
@Injectable()
export class PlanningHooks {
  private readonly handlers: PlanningHandler[] = [];

  register(handler: PlanningHandler): void {
    this.handlers.push(handler);
  }

  async lineDeleting(lineId: string): Promise<void> {
    for (const h of this.handlers) await h.lineDeleting?.(lineId);
  }

  async monthCreated(ctx: MonthContext): Promise<void> {
    for (const h of this.handlers) await h.monthCreated?.(ctx);
  }
}
