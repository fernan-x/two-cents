import { z } from 'zod';
import { AmountMinor } from './budgets';

export const PutIncomeRequest = z.object({ amountMinor: AmountMinor });
export type PutIncomeRequest = z.infer<typeof PutIncomeRequest>;
