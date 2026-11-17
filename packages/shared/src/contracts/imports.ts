import { z } from 'zod';
import { AmountMinor, LocalDate } from './budgets';
import { IncomeLabel } from './income';
import { CreateLineRequest } from './lines';
import { MonthSummaryView } from './months';

/** Spec 003: spreadsheet import, parsed on the device (research R16). */

export const ImportMonth = z.object({
  periodStart: LocalDate,
  incomes: z
    .array(
      z.object({
        membershipId: z.uuid(),
        label: IncomeLabel.optional(),
        amountMinor: AmountMinor,
        countsTowardHousehold: z.boolean(),
      }),
    )
    .max(30),
  /** Private lines are not imported; the member can mark them private afterwards. */
  lines: z.array(CreateLineRequest.omit({ isPrivate: true })).max(200),
});
export type ImportMonth = z.input<typeof ImportMonth>;

export const ImportRequest = z.object({
  dryRun: z.boolean(),
  months: z.array(ImportMonth).min(1).max(36),
});
export type ImportRequest = z.input<typeof ImportRequest>;

export const ImportPreviewResult = z.object({
  months: z.array(
    z.object({
      periodStart: LocalDate,
      conflict: z.literal('exists').nullable(),
      status: z.enum(['closed', 'draft']),
      summary: MonthSummaryView,
      issues: z.array(z.object({ lineIndex: z.number().int(), code: z.string() })),
    }),
  ),
});
export type ImportPreviewResult = z.infer<typeof ImportPreviewResult>;

export const ImportCommitResponse = z.object({ created: z.array(LocalDate) });
export type ImportCommitResponse = z.infer<typeof ImportCommitResponse>;
