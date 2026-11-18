import { z } from 'zod';
import { Payer, PaymentMethod } from './transactions';

/** Spec 004: data the app needs to suggest lines and defaults offline (research R6). */
export const TransactionHints = z.object({
  windowDays: z.number().int(),
  labels: z.array(
    z.object({
      normalizedLabel: z.string(),
      seriesId: z.uuid(),
      count: z.number().int(),
      lastUsedAt: z.iso.datetime(),
    }),
  ),
  mostUsed: z.array(z.object({ seriesId: z.uuid(), count: z.number().int() })),
  lastMethodByPayer: z.array(z.object({ payer: Payer, paymentMethod: PaymentMethod })),
});
export type TransactionHints = z.infer<typeof TransactionHints>;
