import {
  CsvMapping,
  MonthTransactionsView,
  type RecurringRuleCreate,
  RecurringRuleList,
  type RecurringRulePatch,
  RecurringRuleView,
  type SettlementCreate,
  SettlementView,
  type TransactionCreate,
  TransactionHints,
  type TransactionImportRequest,
  TransactionImportResult,
  type TransactionPatch,
  TrackingView,
  TransactionView,
} from '@two-cents/shared/contracts';

import { apiConditionalGet, apiRequest } from '@/auth/api-client';

const b = (id: string) => `/v1/budgets/${encodeURIComponent(id)}`;
const m = (id: string, start: string) => `${b(id)}/months/${encodeURIComponent(start)}`;
const t = (id: string, txnId: string) => `${b(id)}/transactions/${encodeURIComponent(txnId)}`;

/** Typed calls for spec 004 (contracts/rest-api.md); every response is parsed with its contract. */
export const trackingApi = {
  /** Idempotent create by client id (research R3): safe to resend after a lost response. */
  putTransaction: (id: string, txnId: string, body: TransactionCreate) =>
    apiRequest('PUT', t(id, txnId), { body, schema: TransactionView }),
  patchTransaction: (id: string, txnId: string, body: TransactionPatch) =>
    apiRequest('PATCH', t(id, txnId), { body, schema: TransactionView }),
  deleteTransaction: (id: string, txnId: string, expectedVersion: number) =>
    apiRequest('DELETE', `${t(id, txnId)}?expectedVersion=${expectedVersion}`),
  transactions: (id: string, start: string, etag: string | null) =>
    apiConditionalGet(`${m(id, start)}/transactions`, MonthTransactionsView, etag),
  tracking: (id: string, start: string, etag: string | null) =>
    apiConditionalGet(`${m(id, start)}/tracking`, TrackingView, etag),
  paidAsPlanned: (id: string, start: string, lineId: string, txnId: string) =>
    apiRequest('POST', `${m(id, start)}/lines/${encodeURIComponent(lineId)}/paid-as-planned`, {
      body: { txnId },
      schema: TransactionView,
    }),
  hints: (id: string, etag: string | null) => apiConditionalGet(`${b(id)}/transaction-hints`, TransactionHints, etag),

  // Receipts (research R10)
  putReceipt: (id: string, txnId: string, receiptId: string, jpeg: Uint8Array) =>
    apiRequest('PUT', `${t(id, txnId)}/receipts/${encodeURIComponent(receiptId)}`, {
      rawBody: { contentType: 'image/jpeg', data: jpeg },
    }),
  deleteReceipt: (id: string, txnId: string, receiptId: string) =>
    apiRequest('DELETE', `${t(id, txnId)}/receipts/${encodeURIComponent(receiptId)}`),
  receiptPath: (id: string, txnId: string, receiptId: string) =>
    `${t(id, txnId)}/receipts/${encodeURIComponent(receiptId)}`,

  // Balances (US6)
  settle: (id: string, start: string, body: SettlementCreate) =>
    apiRequest('POST', `${m(id, start)}/settlements`, { body, schema: SettlementView }),

  // Recurring (US8)
  recurring: (id: string) => apiRequest('GET', `${b(id)}/recurring-transactions`, { schema: RecurringRuleList }),
  createRecurring: (id: string, body: RecurringRuleCreate) =>
    apiRequest('POST', `${b(id)}/recurring-transactions`, { body, schema: RecurringRuleView }),
  patchRecurring: (id: string, ruleId: string, body: RecurringRulePatch) =>
    apiRequest('PATCH', `${b(id)}/recurring-transactions/${encodeURIComponent(ruleId)}`, {
      body,
      schema: RecurringRuleView,
    }),
  deleteRecurring: (id: string, ruleId: string, expectedVersion: number) =>
    apiRequest('DELETE', `${b(id)}/recurring-transactions/${encodeURIComponent(ruleId)}?expectedVersion=${expectedVersion}`),

  // CSV import (US9)
  csvMapping: (id: string, fingerprint: string) =>
    apiRequest('GET', `${b(id)}/csv-mappings/${encodeURIComponent(fingerprint)}`, { schema: CsvMapping }),
  saveCsvMapping: (id: string, fingerprint: string, body: CsvMapping) =>
    apiRequest('PUT', `${b(id)}/csv-mappings/${encodeURIComponent(fingerprint)}`, { body, schema: CsvMapping }),
  importTransactions: (id: string, body: TransactionImportRequest) =>
    apiRequest('POST', `${b(id)}/transaction-imports`, { body, schema: TransactionImportResult }),
};
