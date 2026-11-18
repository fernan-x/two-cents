import type { Mutation, QueryClient } from '@tanstack/react-query';
import type {
  FullTransactionView,
  MonthTransactionsView,
  TransactionCreate,
  TransactionPatch,
  TransactionView,
} from '@two-cents/shared/contracts';

import { ApiError } from '@/auth/api-client';

import { trackingApi } from './api';
import { trackingKeys } from './query-keys';

/** A transaction shown before the server confirmed it (FR-010, research R3). */
export type LocalTransaction = TransactionView & { _pending?: true };

export type TrackingMutationKind = 'create' | 'patch' | 'delete' | 'receipt' | 'paidAsPlanned';
export const trackingMutationKey = (kind: TrackingMutationKind) => ['tracking', kind] as const;
export const isTrackingMutation = (key: readonly unknown[] | undefined): boolean => key?.[0] === 'tracking';

interface Base {
  budgetId: string;
  /** The month the app expects; the server decides from the date (FR-002). */
  monthStart: string;
  txnId: string;
}
export interface CreateVars extends Base {
  body: TransactionCreate;
  currency: string;
}
export interface PatchVars extends Base {
  body: TransactionPatch;
}
export interface DeleteVars extends Base {
  expectedVersion: number;
}
/** Receipts are queued as base64 so a paused upload survives a restart (JSON storage). */
export interface ReceiptVars extends Base {
  receiptId: string;
  base64: string;
}
export interface PaidAsPlannedVars extends Base {
  lineId: string;
}

export type ListData = Omit<MonthTransactionsView, 'transactions'> & { transactions: LocalTransaction[] };

function updateList(client: QueryClient, budgetId: string, monthStart: string, fn: (rows: LocalTransaction[]) => LocalTransaction[]) {
  client.setQueryData<ListData>(trackingKeys.transactions(budgetId, monthStart), (data) =>
    data ? { ...data, transactions: fn(data.transactions) } : data,
  );
}

const byDateDesc = (a: LocalTransaction, b: LocalTransaction) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/** The optimistic row for a create: what the person typed, marked pending. */
export function pendingRow(v: CreateVars): LocalTransaction {
  const now = new Date().toISOString();
  const row: FullTransactionView = {
    private: false,
    id: v.txnId,
    monthStart: v.monthStart,
    date: v.body.date,
    amountMinor: v.body.amountMinor,
    currency: v.currency,
    isRefund: v.body.amountMinor.startsWith('-'),
    label: v.body.label.trim(),
    payer: v.body.payer,
    paymentMethod: v.body.paymentMethod ?? (v.body.payer.kind === 'joint' ? 'joint_card' : 'personal_card'),
    isPlanned: v.body.isPlanned ?? v.body.parts.length > 0,
    isShared: v.body.isShared ?? false,
    note: v.body.note ?? null,
    parts: v.body.parts.map((p, i) => ({
      id: `${v.txnId}-${i}`,
      lineId: p.lineId,
      subItemId: p.subItemId ?? null,
      amountMinor: p.amountMinor,
      needsReview: false,
    })),
    receipts: [],
    origin: v.body.origin,
    recurringRuleId: null,
    version: 1,
    createdAt: now,
    createdBy: null,
    updatedAt: now,
    updatedBy: null,
    can: { edit: true, delete: true },
  };
  return { ...row, _pending: true };
}

function settle(client: QueryClient, budgetId: string, monthStarts: string[]) {
  for (const start of new Set(monthStarts)) {
    void client.invalidateQueries({ queryKey: trackingKeys.transactions(budgetId, start) });
    void client.invalidateQueries({ queryKey: trackingKeys.tracking(budgetId, start) });
  }
  void client.invalidateQueries({ queryKey: trackingKeys.hints(budgetId) });
}

const placeServerRow = (client: QueryClient, v: Base, view: TransactionView) => {
  if (view.monthStart !== v.monthStart) updateList(client, v.budgetId, v.monthStart, (rows) => rows.filter((r) => r.id !== v.txnId));
  updateList(client, v.budgetId, view.monthStart, (rows) =>
    [view, ...rows.filter((r) => r.id !== view.id)].sort(byDateDesc),
  );
};

/** Network failures retry; a refusal by the server (4xx) does not, and waits in "À résoudre". */
const retry = (count: number, error: Error) =>
  error instanceof ApiError && (error.code === 'NETWORK' || error.status >= 500) && count < 5;
const retryDelay = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);

/**
 * Registers how every spec 004 write runs (research R3). Must run before persisted mutations are
 * restored, so a write queued offline yesterday still knows how to send itself today.
 */
export function registerTrackingMutations(client: QueryClient): void {
  client.setMutationDefaults<TransactionView, Error, CreateVars>(trackingMutationKey('create'), {
    mutationFn: (v: CreateVars) => trackingApi.putTransaction(v.budgetId, v.txnId, v.body),
    onMutate: (v: CreateVars) => {
      updateList(client, v.budgetId, v.monthStart, (rows) =>
        [pendingRow(v), ...rows.filter((r) => r.id !== v.txnId)].sort(byDateDesc),
      );
    },
    onSuccess: (view: TransactionView, v: CreateVars) => placeServerRow(client, v, view),
    onSettled: (_d: unknown, _e: unknown, v: CreateVars) => settle(client, v.budgetId, [v.monthStart]),
    retry,
    retryDelay,
  });
  client.setMutationDefaults<TransactionView, Error, PatchVars>(trackingMutationKey('patch'), {
    mutationFn: (v: PatchVars) => trackingApi.patchTransaction(v.budgetId, v.txnId, v.body),
    onSuccess: (view: TransactionView, v: PatchVars) => placeServerRow(client, v, view),
    onSettled: (d: TransactionView | undefined, _e: unknown, v: PatchVars) =>
      settle(client, v.budgetId, [v.monthStart, ...(d ? [d.monthStart] : [])]),
    retry,
    retryDelay,
  });
  client.setMutationDefaults<unknown, Error, DeleteVars>(trackingMutationKey('delete'), {
    mutationFn: (v: DeleteVars) => trackingApi.deleteTransaction(v.budgetId, v.txnId, v.expectedVersion),
    onMutate: (v: DeleteVars) => updateList(client, v.budgetId, v.monthStart, (rows) => rows.filter((r) => r.id !== v.txnId)),
    onSettled: (_d: unknown, _e: unknown, v: DeleteVars) => settle(client, v.budgetId, [v.monthStart]),
    retry,
    retryDelay,
  });
  client.setMutationDefaults<unknown, Error, ReceiptVars>(trackingMutationKey('receipt'), {
    mutationFn: (v: ReceiptVars) =>
      trackingApi.putReceipt(v.budgetId, v.txnId, v.receiptId, base64ToBytes(v.base64)),
    onSettled: (_d: unknown, _e: unknown, v: ReceiptVars) => settle(client, v.budgetId, [v.monthStart]),
    retry,
    retryDelay,
  });
  client.setMutationDefaults<TransactionView, Error, PaidAsPlannedVars>(trackingMutationKey('paidAsPlanned'), {
    mutationFn: (v: PaidAsPlannedVars) => trackingApi.paidAsPlanned(v.budgetId, v.monthStart, v.lineId, v.txnId),
    onSuccess: (view: TransactionView, v: PaidAsPlannedVars) => placeServerRow(client, v, view),
    onSettled: (_d: unknown, _e: unknown, v: PaidAsPlannedVars) => settle(client, v.budgetId, [v.monthStart]),
    retry,
    retryDelay,
  });
}

/**
 * Runs a spec 004 write with the transaction id as its scope: create → edit → delete of one
 * transaction always run in that order, even when they were queued offline (research R3).
 */
export function runTrackingMutation<V extends Base>(
  client: QueryClient,
  kind: TrackingMutationKind,
  vars: V,
): Promise<unknown> {
  const mutation = client
    .getMutationCache()
    .build(client, { mutationKey: trackingMutationKey(kind), scope: { id: vars.txnId } });
  return mutation.execute(vars);
}

/** Writes waiting for the network, or refused and waiting for the person (FR-016). */
export function trackingMutations(client: QueryClient): {
  pending: Mutation<unknown, Error, unknown>[];
  failed: Mutation<unknown, Error, unknown>[];
} {
  const all = client.getMutationCache().findAll({ predicate: (m) => isTrackingMutation(m.options.mutationKey) });
  return {
    pending: all.filter((m) => m.state.status === 'pending' || m.state.isPaused),
    failed: all.filter((m) => m.state.status === 'error'),
  };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) |
      (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}
