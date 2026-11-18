# REST API Contract: Transaction Tracking

Source of truth at implementation time: Zod schemas in `packages/shared/src/contracts/`
(`transactions.ts`, `tracking.ts`, `settlements.ts`, `recurring.ts`, `transaction-imports.ts`,
`transaction-hints.ts`), Principle VII. Base path `/v1`. Auth, error envelope and common errors
as in [002 rest-api.md](../../002-shared-budgets/contracts/rest-api.md) and
[003 rest-api.md](../../003-monthly-budget-planning/contracts/rest-api.md) (`401`,
`404 budget_not_found` for non-members, `403 forbidden`, `400 validation_failed`,
`409 stale_state`, `409 month_closed`, `429`).

Every route below is added to the route-coverage authz test (non-member → 404, Viewer write → 403).

**New errors**

| Status & code | When |
|---|---|
| `404 month_not_found` | no month for the transaction's date; body `{ periodStart, canCreate }` |
| `409 month_closed` | write into a Closed month; body `{ monthStart, canReopen }` |
| `409 id_conflict` | `PUT` create replayed with a different body for an existing id |
| `400 parts_mismatch` | Σ parts ≠ amount; body `{ differenceMinor }` (signed) |
| `400 line_not_in_month` | a part's line or sub-item is not in the transaction's month |
| `400 invalid_payment_method` | payer/method combination not allowed |
| `403 not_line_owner` | personal-line transaction written by someone other than the line owner |
| `413 receipt_too_large` / `409 too_many_receipts` | receipt > 1 MB / more than 3 |
| `400 settlement_exceeds_balance` | settlement larger than the open balance in that direction |

**Shared types**

```ts
type AmountMinor = string;          // /^\d{1,18}$/  (003)
type SignedAmountMinor = string;    // /^-?\d{1,18}$/ (003)
type Payer = { kind: 'member'; membershipId: string } | { kind: 'joint' };
type PaymentMethod = 'personal_card' | 'joint_card' | 'meal_voucher' | 'cash' | 'transfer';
type TxPartInput = { lineId: string | null; subItemId?: string | null; amountMinor: SignedAmountMinor };
type TxOrigin = 'quick_add' | 'edit_form' | 'paid_as_planned' | 'recurring' | 'import';
```

---

## Transactions

### `PUT /budgets/:budgetId/transactions/:txnId` — create (idempotent)

`txnId` is a client-generated UUID v7 (research R3). Permission `transactions.write`.

```ts
// body: TransactionCreate
{
  date: string;                       // YYYY-MM-DD
  amountMinor: SignedAmountMinor;     // ≠ "0"; negative ⇒ refund
  label: string;                      // 1–60
  payer: Payer;
  paymentMethod?: PaymentMethod;      // default R8/FR-005
  parts: TxPartInput[];               // [] = unassigned; 1 part = one line; ≥2 = split
  isPlanned?: boolean;                // default: parts.length > 0
  isShared?: boolean;                 // only for unassigned; default false
  note?: string | null;               // ≤ 500
  origin: TxOrigin;                   // quick_add | edit_form | import (others are server-only)
  suggestion?: 'kept' | 'changed';    // when a line suggestion was shown (R6, FR-013)
}
```

- `201` → `TransactionView` (created); `200` → same `TransactionView` when replayed with an
  identical body.
- A part whose `lineId` no longer exists in the month is stored with `lineId: null`,
  `needsReview: true` (R3, FR-016) — not an error.
- Errors: `404 month_not_found`, `409 month_closed`, `409 id_conflict`, `400 parts_mismatch`,
  `400 line_not_in_month`, `400 invalid_payment_method`, `403 not_line_owner`.

```ts
// TransactionView
{
  id; monthStart; date; amountMinor: SignedAmountMinor; currency; isRefund: boolean;
  label; payer: Payer; paymentMethod; isPlanned; isShared; note: string | null;
  parts: { id; lineId: string | null; subItemId: string | null; amountMinor: SignedAmountMinor; needsReview: boolean }[];
  receipts: { id; createdAt }[];
  origin: TxOrigin; recurringRuleId: string | null;
  version: number; createdAt; createdBy: PersonRef | null; updatedAt; updatedBy: PersonRef | null;
  can: { edit: boolean; delete: boolean };
}
// Private (another member's private line): { id, monthStart, date, private: true, ownerMembershipId }
// — no label, amount, note, parts or receipts. Its amount is only in TrackingView.privateAggregates.
```

### `PATCH /budgets/:budgetId/transactions/:txnId`

Body: any subset of `TransactionCreate` fields (except `origin`) + `expectedVersion: number`.
Changing `date` to another period moves the transaction to that month (both must be open).
`200` → `TransactionView`. Errors: as create + `409 stale_state { current: TransactionView }`.

### `DELETE /budgets/:budgetId/transactions/:txnId?expectedVersion=N`

`204`. Deleting an already deleted id → `204` (idempotent for offline retries).
`409 month_closed`, `409 stale_state`.

### `GET /budgets/:budgetId/months/:monthStart/transactions`

All transactions of the month, newest first (`date DESC, createdAt DESC`). Filtering and
search are done on the device (FR-017, works offline). `ETag: "<month revision>"`, supports
`If-None-Match` → `304`.

```ts
{ monthStart; revision: string; transactions: TransactionView[] }
```

### Receipts

- `PUT /budgets/:budgetId/transactions/:txnId/receipts/:receiptId` — body raw `image/jpeg`
  (≤ 1 MB). `201` / `200` on identical replay. Errors: `413 receipt_too_large`,
  `409 too_many_receipts`, `409 month_closed`.
- `GET …/receipts/:receiptId` → `200 image/jpeg`, `Cache-Control: private, max-age=86400`.
  Hidden (404) for others when the transaction is on a private line.
- `DELETE …/receipts/:receiptId` → `204`.

### `POST /budgets/:budgetId/months/:monthStart/lines/:lineId/paid-as-planned`

Body `{ txnId: uuid }` (client id, idempotent). Creates the FR-025 transaction:
amount = line planned total, label = line label, date = today (budget time zone), payer = joint
account by transfer (shared line) or owner by personal card (personal line), planned,
origin `paid_as_planned`. `201` → `TransactionView`. `409 month_closed`; `403 not_line_owner`.

## Tracking (planned vs actual)

### `GET /budgets/:budgetId/months/:monthStart/tracking`

`ETag: "<month revision>"`, `304` supported. Computed by shared `computeTracking`,
`computeBalances`, `voucherRemaining` (research R2).

```ts
// TrackingView
{
  monthStart; status: MonthStatus; revision: string;
  lines: {
    lineId; group; planned: AmountMinor;
    actual: SignedAmountMinor | null;            // null = not tracked
    difference: SignedAmountMinor | null; differencePermille: number | null;
    txnCount: number;
    envelope: null | { spent: SignedAmountMinor; remaining: AmountMinor; over: AmountMinor;
                       progressPermille: number; level: 'ok' | 'warning' | 'over';
                       subItems: { subItemId; spent: SignedAmountMinor; remaining: AmountMinor | null }[] };
  }[];
  privateAggregates: { membershipId; plannedMinor: AmountMinor; actualMinor: SignedAmountMinor | null }[];
  groups: { group; totals: Totals }[];
  unassigned: { actual: SignedAmountMinor; txnCount: number; needsReviewCount: number };
  month: Totals;                                 // includes unassigned in actual
  balances: { from: string; to: string; amountMinor: AmountMinor }[];   // open, netted, non-zero
  settlements: SettlementView[];
  vouchers: { membershipId; incomeMinor: AmountMinor; spentMinor: SignedAmountMinor; remainingMinor: SignedAmountMinor }[];
}
type Totals = { plannedAll: AmountMinor; plannedTracked: AmountMinor; actual: SignedAmountMinor;
                difference: SignedAmountMinor; differencePermille: number | null; notTrackedCount: number };
```

003 `MonthDetail.actuals` stays `null` and is deprecated (research R5).

## Balances and settlements

### `POST /budgets/:budgetId/months/:monthStart/settlements`

Body `{ fromMembershipId, toMembershipId, amountMinor: AmountMinor }` — normally the full open
balance shown ("Marquer comme réglé"). Allowed on Closed months. `201` → `SettlementView
{ id, from, to, amountMinor, createdAt, createdBy }`. `400 settlement_exceeds_balance`.
No update or delete (data-model: reverse with an opposite settlement).

## Hints (suggestions, most used)

### `GET /budgets/:budgetId/transaction-hints`

`ETag` = hash of latest txn `updated_at` in the budget + caller id. Excludes other members'
private-line transactions (FR-012).

```ts
{
  windowDays: 90;
  labels: { normalizedLabel: string; seriesId: string; count: number; lastUsedAt: string }[];
  mostUsed: { seriesId: string; count: number }[];          // caller only
  lastMethodByPayer: { payer: Payer; paymentMethod: PaymentMethod }[];   // caller only
}
```

## Recurring transactions

| Route | Body / result |
|---|---|
| `GET /budgets/:b/recurring-transactions` | `RecurringRuleView[]` |
| `POST /budgets/:b/recurring-transactions` | `{ label, amountMinor, dayOfMonth (1–31), payer, paymentMethod, seriesId \| null, isShared?, startsOn }` → `201 RecurringRuleView` |
| `PATCH /budgets/:b/recurring-transactions/:id` | subset + `active?` + `expectedVersion` → `200`; future occurrences only |
| `DELETE /budgets/:b/recurring-transactions/:id?expectedVersion=N` | `204`; created transactions kept |

`RecurringRuleView = { id, label, amountMinor, dayOfMonth, payer, paymentMethod, seriesId,
lineLabel: string | null, isShared, active, startsOn, nextOccurrence: string | null, version }`.
`seriesId` must be a recurring series (Personal or Recurring shared) of this budget; a personal
series only for its owner (`403 not_line_owner`).

## CSV import

### `GET /budgets/:b/csv-mappings/:headerFingerprint` → `200 CsvMapping` | `404`
### `PUT /budgets/:b/csv-mappings/:headerFingerprint` body `CsvMapping` → `200`

### `POST /budgets/:b/transaction-imports`

The file is parsed on the device (research R11); only structured rows are sent.

```ts
// body
{
  dryRun: boolean;
  account: { kind: 'joint' } | { kind: 'member' };     // member = the caller
  closedMonthAction?: 'reopen' | 'move_to_current' | 'skip';   // required on commit if any row is in a Closed month
  rows: {
    rowId: string;                 // client id, becomes the txn id on commit
    importKey: string;             // R11
    date: string; amountMinor: SignedAmountMinor; label: string;
    parts: TxPartInput[]; isPlanned: boolean; isShared?: boolean;
    include: boolean;
  }[];                             // ≤ 1 000 rows
}
// 200 (dryRun) / 201 (commit)
{
  rows: { rowId; duplicateOf: string | null; alreadyImported: boolean;
          monthStatus: 'open' | 'closed' | 'missing'; error: ErrorCode | null }[];
  created?: number;                // commit only
}
```

Commit is all-or-nothing; rows with `monthStatus: 'missing'` must be excluded or moved
(`404 month_not_found` otherwise); `reopen` requires Owner/Admin (`403 forbidden`).

## Changes to 003 contracts (additive)

- `IncomeLineInput` / `IncomeLineView`: `isMealVoucher?: boolean` (default `false`); when
  true, `countsTowardHousehold` is forced to `false`.
- `ChangeView.entity`: + `transaction`, `settlement`, `recurring_rule`; `cause`: + `recurring`,
  `paid_as_planned`. Older apps render unknown entities with the generic sentence (verify 003
  client tolerates unknown enum values; if it does not, these entries are filtered for
  `X-App-Version` below the 004 release).
- `MonthDetail.actuals`: always `null`, deprecated.
