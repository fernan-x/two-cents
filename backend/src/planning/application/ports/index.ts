import type { ActualsView } from '@two-cents/shared/contracts';

/** Actual spending per line and member; provided by feature 04, null until then (research R12). */
export interface ActualsProvider {
  forMonth(monthId: string): Promise<ActualsView | null>;
}
export const ACTUALS_PROVIDER = Symbol('ActualsProvider');
