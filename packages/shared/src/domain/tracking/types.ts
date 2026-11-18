/** Tracking types (spec 004 data-model.md "Shared domain types"). Money is always bigint minor units. */
import type { Group } from '../planning/types';

export const PAYMENT_METHODS = ['personal_card', 'joint_card', 'meal_voucher', 'cash', 'transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Who paid: a member, or the budget's joint account. */
export type Payer = { kind: 'member'; membershipId: string } | { kind: 'joint' };

/** A share of a transaction counted against one line (or none when `lineId` is null). */
export interface TxPart {
  lineId: string | null;
  subItemId: string | null;
  /** Same sign as the transaction amount. */
  amount: bigint;
}

export interface Tx {
  id: string;
  date: string;
  /** Negative for a refund. Never 0. */
  amount: bigint;
  payer: Payer;
  method: PaymentMethod;
  isPlanned: boolean;
  /** Only meaningful for an unassigned transaction (FR-028). */
  isShared: boolean;
  /** Empty = unassigned. Parts add up to `amount`. */
  parts: TxPart[];
}

/** A budget line as tracking needs it. */
export interface TrackLine {
  id: string;
  group: Group;
  planned: bigint;
  isEnvelope: boolean;
  /** Personal lines only. */
  ownerMembershipId: string | null;
  isPrivate: boolean;
  subItems: { id: string; amount: bigint | null }[];
  /** Planned per-member shares (used for balances). */
  shares: Readonly<Record<string, bigint>>;
  /**
   * Actual already known from elsewhere (the "Privé" rows the app receives as aggregates):
   * `undefined` = compute from transactions, `null` = not tracked.
   */
  fixedActual?: bigint | null;
}

export type EnvelopeLevel = 'ok' | 'warning' | 'over';

export interface EnvelopeState {
  spent: bigint;
  /** planned − spent, never below 0. */
  remaining: bigint;
  /** spent − planned, never below 0. */
  over: bigint;
  progressPermille: number;
  level: EnvelopeLevel;
}

export interface SubItemState {
  spent: bigint;
  remaining: bigint | null;
}

export interface LineTracking {
  lineId: string;
  group: Group;
  planned: bigint;
  /** null = not tracked (FR-023). */
  actual: bigint | null;
  difference: bigint | null;
  differencePermille: number | null;
  txnCount: number;
  envelope: (EnvelopeState & { subItems: ({ subItemId: string } & SubItemState)[] }) | null;
}

export interface Totals {
  plannedAll: bigint;
  plannedTracked: bigint;
  actual: bigint;
  difference: bigint;
  differencePermille: number | null;
  notTrackedCount: number;
}

export interface Balance {
  /** Debtor. */
  from: string;
  /** Creditor. */
  to: string;
  /** > 0. */
  amount: bigint;
}

export interface VoucherState {
  membershipId: string;
  income: bigint;
  spent: bigint;
  remaining: bigint;
}
