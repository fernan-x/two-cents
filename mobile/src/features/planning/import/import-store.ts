import type { Workbook } from './read-workbook';

/**
 * The workbook being imported, held in memory between the pick screen and the preview (research
 * R16: never persisted, never uploaded). Cleared on cancel and after a commit.
 */
let current: { budgetId: string; workbook: Workbook } | null = null;

export const importStore = {
  set(budgetId: string, workbook: Workbook): void {
    current = { budgetId, workbook };
  },
  get(budgetId: string): Workbook | null {
    return current?.budgetId === budgetId ? current.workbook : null;
  },
  clear(): void {
    current = null;
  },
};
