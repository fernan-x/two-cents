import { z } from 'zod';
import { LocalDate } from './budgets';
import { ErrorCode } from './errors';
import { TxAmountMinor, TxLabel, TxPartInput } from './transactions';

/** Spec 004: bank CSV import (contracts/rest-api.md "CSV import", research R11). */

export const CsvMapping = z.object({
  delimiter: z.enum([';', ',', '\t']),
  encoding: z.enum(['utf-8', 'windows-1252']),
  dateColumn: z.number().int().min(0),
  dateFormat: z.enum(['DD/MM/YYYY', 'YYYY-MM-DD']),
  labelColumns: z.array(z.number().int().min(0)).min(1),
  amountColumn: z.number().int().min(0).nullable(),
  debitColumn: z.number().int().min(0).nullable(),
  creditColumn: z.number().int().min(0).nullable(),
  /** Rows before the header row. */
  skipRows: z.number().int().min(0),
});
export type CsvMapping = z.infer<typeof CsvMapping>;

export const TransactionImportRow = z.object({
  rowId: z.uuid(),
  importKey: z.string().min(1).max(400),
  date: LocalDate,
  amountMinor: TxAmountMinor,
  label: TxLabel,
  parts: z.array(TxPartInput).max(10),
  isPlanned: z.boolean(),
  isShared: z.boolean().optional(),
  include: z.boolean(),
});
export type TransactionImportRow = z.input<typeof TransactionImportRow>;

export const TransactionImportRequest = z.object({
  dryRun: z.boolean(),
  account: z.discriminatedUnion('kind', [z.object({ kind: z.literal('joint') }), z.object({ kind: z.literal('member') })]),
  closedMonthAction: z.enum(['reopen', 'move_to_current', 'skip']).optional(),
  rows: z.array(TransactionImportRow).max(1000),
});
export type TransactionImportRequest = z.input<typeof TransactionImportRequest>;

export const TransactionImportResult = z.object({
  rows: z.array(
    z.object({
      rowId: z.uuid(),
      duplicateOf: z.uuid().nullable(),
      alreadyImported: z.boolean(),
      monthStatus: z.enum(['open', 'closed', 'missing']),
      error: ErrorCode.nullable(),
    }),
  ),
  created: z.number().int().optional(),
});
export type TransactionImportResult = z.infer<typeof TransactionImportResult>;
