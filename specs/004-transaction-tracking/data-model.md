# Data Model: Transaction Tracking

**Feature**: 004-transaction-tracking | **Storage**: PostgreSQL 18 (Drizzle), same conventions
as 002/003: `id` = UUID v7, timestamps `timestamptz`, money = `bigint` minor units + `char(3)`
currency (Principle I), text NFC-normalized and trimmed. Migration: `0007_transactions.sql`.

Referenced from 002/003: `budget`, `membership`, `budget_month`, `budget_line`,
`budget_line_share`, `envelope_sub_item`, `income_line`, `month_change`.

---

## txn

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | **client-generated** UUID v7 (R3); idempotent create |
| budget_id | uuid → budget, cascade | |
| month_id | uuid → budget_month, restrict | month whose period contains `date` (FR-002) |
| date | date | in the budget's `time_zone` |
| amount_minor | bigint | ≠ 0; −100 000 000 ≤ amount ≤ 100 000 000; negative only when `is_refund` |
| currency | char(3) | = budget currency |
| is_refund | boolean | `amount_minor < 0` ⇔ `is_refund` |
| label | text | 1–60 chars after trim |
| label_normalized | text | `normalizeLabel(label)` (R6), indexed |
| payer_membership_id | uuid → membership null | null = joint account |
| payment_method | enum `personal_card \| joint_card \| meal_voucher \| cash \| transfer` | `validatePayment` (R8) |
| is_planned | boolean | FR-004 default from parts |
| planned_set_by_hand | boolean | keeps the flag when the line changes (spec edge case) |
| is_shared | boolean | derived from parts for assigned txns; user choice when unassigned (FR-028) |
| note | text null | ≤ 500 chars |
| origin | enum `quick_add \| edit_form \| paid_as_planned \| recurring \| import` | |
| recurring_rule_id | uuid → recurring_txn_rule null, set null | |
| scheduled_date | date null | set iff `recurring_rule_id` set at creation |
| import_key | text null | R11; unique `(budget_id, import_key)` where not null |
| version | int, default 1 | R13 |
| created_at/by, updated_at/by | | by = membership (null for system/recurring) |

Checks: `amount_minor <> 0`; `(amount_minor < 0) = is_refund`; label length; note length;
`payment_method <> 'joint_card' OR payer_membership_id IS NULL`;
`payment_method NOT IN ('personal_card','meal_voucher') OR payer_membership_id IS NOT NULL`.
Unique `(recurring_rule_id, scheduled_date)` where `recurring_rule_id` not null (R9).
Indexes: `(month_id, date DESC, id)`, `(budget_id, created_at)` for hints (90 days),
`(budget_id, label_normalized)`.

## txn_part

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| txn_id | uuid → txn, cascade | |
| line_id | uuid → budget_line null, **set null** | line of the same month (checked in use case) |
| sub_item_id | uuid → envelope_sub_item null, set null | must belong to `line_id` |
| amount_minor | bigint | same sign as the transaction, ≠ 0 |
| needs_review | boolean | line deleted or missing (FR-045, R9) |
| position | int | |

**Deferrable constraint trigger**: for each touched txn with ≥ 1 part, Σ `amount_minor` =
`txn.amount_minor` (FR-006). A txn with zero parts is unassigned. A txn has at most one part
with `line_id IS NULL`. Index `(line_id)`.

Derived rule (domain, not stored): a part is shared iff its line's group is
`recurring_shared` or `one_off_shared`; personal iff `personal`; an unassigned txn uses
`txn.is_shared`. A txn cannot mix personal parts of different owners.

## txn_receipt

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | client-generated (idempotent upload) |
| txn_id | uuid → txn, cascade | max 3 per txn |
| content_type | text | `image/jpeg` |
| bytes | bytea | ≤ 1 048 576 bytes |
| created_at/by | | |

Never selected by list queries (R10).

## settlement

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| budget_id | uuid → budget, cascade | |
| month_id | uuid → budget_month, cascade | allowed on any status (R5) |
| from_membership_id | uuid → membership | debtor |
| to_membership_id | uuid → membership | creditor; ≠ from |
| amount_minor | bigint | > 0 |
| created_at / created_by | | |

Settlements are immutable once recorded; a mistaken one is reversed by recording one in the
opposite direction (traceability, Principle I).

## recurring_txn_rule

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| budget_id | uuid → budget, cascade | |
| label | text | 1–60 |
| amount_minor | bigint | > 0, ≤ 100 000 000 |
| currency | char(3) | |
| day_of_month | smallint | 1–31 |
| payer_membership_id | uuid → membership null | null = joint account |
| payment_method | enum (as txn) | `validatePayment` |
| series_id | uuid null | 003 recurring series of the target line; null = unassigned |
| is_shared | boolean | for unassigned rules |
| active | boolean | pause/resume |
| starts_on | date | first period considered |
| version | int | |
| created_at/by, updated_at/by | | |

## recurring_skip

| Column | Type | Rules |
|--------|------|-------|
| rule_id | uuid → recurring_txn_rule, cascade | |
| scheduled_date | date | |
| reason | enum `month_closed` | |
| created_at | | |

PK `(rule_id, scheduled_date)`; makes the skip notification fire once.

## bank_csv_mapping

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| budget_id | uuid → budget, cascade | |
| header_fingerprint | text | hash of normalized header row (R11) |
| mapping | jsonb | `{ delimiter, encoding, dateColumn, dateFormat, labelColumns[], amountColumn? , debitColumn?, creditColumn?, skipRows }` (Zod `CsvMapping`) |
| updated_at / updated_by | | |

Unique `(budget_id, header_fingerprint)`.

## suggestion_stat

| Column | Type | Rules |
|--------|------|-------|
| budget_id | uuid → budget, cascade | |
| membership_id | uuid → membership, cascade | |
| day | date | |
| kept | int | |
| changed | int | |

PK `(budget_id, membership_id, day)`. No label, amount or line (FR-013).

## Changes to 003 tables

| Table | Change |
|-------|--------|
| `income_line` | + `is_meal_voucher boolean default false`; check `NOT is_meal_voucher OR NOT counts_toward_household` (R8) |
| `month_change.entity` | + `transaction`, `settlement`, `recurring_rule` |
| `month_change.cause` | + `recurring`, `paid_as_planned` |
| `budget_month.revision` | also bumped by every write in this feature (R4) |

---

## Shared domain types (packages/shared/src/domain/tracking)

```ts
type Minor = bigint;
type Payer = { kind: 'member'; membershipId: string } | { kind: 'joint' };
type PaymentMethod = 'personal_card' | 'joint_card' | 'meal_voucher' | 'cash' | 'transfer';
interface TxPart { lineId: string | null; subItemId: string | null; amount: Minor }
interface Tx {
  id: string; date: string; amount: Minor; payer: Payer; method: PaymentMethod;
  isPlanned: boolean; isShared: boolean; parts: TxPart[];   // [] = unassigned
}
interface LineTracking {
  lineId: string; planned: Minor; actual: Minor | null;     // null = not tracked
  difference: Minor | null; differencePermille: number | null;
  envelope?: EnvelopeState;
}
interface EnvelopeState { spent: Minor; remaining: Minor; over: Minor; progressPermille: number; level: 'ok' | 'warning' | 'over' }
interface Totals { plannedAll: Minor; plannedTracked: Minor; actual: Minor; difference: Minor; differencePermille: number | null; notTrackedCount: number }
interface Balance { from: string; to: string; amount: Minor }          // amount > 0
interface VoucherState { membershipId: string; income: Minor; spent: Minor; remaining: Minor }
```

Functions (test-first): `lineActuals`, `computeTracking`, `envelopeState`, `computeBalances`,
`voucherRemaining`, `validatePayment`, `defaultPlanned`, `validateParts`, `normalizeLabel`,
`stripBankNoise`, `suggestLine`, `mostUsedLines`, `findDuplicates`, `occurrenceDate`;
`csv/`: `decodeText`, `parseCsv`, `proposeCsvMapping`, `rowsFromCsv`.

## Validation summary (from spec)

| Rule | Where |
|------|-------|
| Amount parsing, ≠ 0, ≤ 1 000 000,00 €, negative only as refund | `parseAmount` + keypad + Zod + DB check |
| Parts add up to amount | `validateParts` + deferred trigger |
| Part line belongs to the txn's month; sub-item belongs to the line | use case (`400 line_not_in_month`) |
| Payer/method compatibility | `validatePayment` + DB checks (`400 invalid_payment_method`) |
| Personal-line txn edited only by line owner | use case (`403 not_line_owner`) |
| No writes in a Closed month | use case (`409 month_closed`, body `canReopen`) |
| No month for the date | use case (`404 month_not_found`, body `canCreate`) |
| Concurrent edit | `expectedVersion` (`409 stale_state`) |
| Same id, different body | `409 id_conflict` |
| Receipts ≤ 3 per txn, ≤ 1 MB, JPEG | use case + Nest body limit (`413 receipt_too_large`, `409 too_many_receipts`) |
| Recurring exactly once | unique `(recurring_rule_id, scheduled_date)` |
| Re-import detected | unique `(budget_id, import_key)` + `findDuplicates` |
| Meal-voucher income never household-counted | DB check + income use case |
