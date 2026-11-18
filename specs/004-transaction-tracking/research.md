# Research: Transaction Tracking

**Feature**: 004-transaction-tracking | **Date**: 2026-11-17

Foundations from 001–003 are reused as-is: PostgreSQL 18 + Drizzle, `packages/shared`
(`/domain` + `/contracts`), clean-architecture backend modules, `BudgetAccessGuard` (404 to
non-members) and the route-coverage authz test, `budget_month` + revision + ETag polling
(003 R4), per-row `version` + `409 stale_state` (003 R5), `month_change` history (003 R11),
private-line redaction (003 R10), `splitByWeights` (003 R2), `parseAmount`, `@nestjs/schedule`
jobs behind advisory locks (002), Expo push sender, `expo-network` → `onlineManager`.
This document only records what is new.

---

## R1. Where a transaction lives

- **Decision**: A `txn` row per transaction, always attached to a `budget_month` (the month
  whose period contains its date, `budgetMonthFor()` with the budget's start day and
  `time_zone`). Allocation to lines lives in `txn_part` rows (one part normally, 2+ when
  split, zero parts when unassigned). Parts sum to the transaction amount (domain check +
  deferrable constraint trigger, same pattern as 003 shares).
- **No month for the date** → `404 month_not_found` with `canCreate`; the app offers
  "create from previous month" (003 `POST /months`) and retries. A transaction is never stored
  without a month, so every actual has a plan to compare against.
- **Line reference**: `txn_part.line_id` points to the line *in that month*. Suggestions and
  "most used" work across months through the line's `series_id` (003 R7).
- **Alternatives considered**: a `line_id` column on `txn` plus a separate split table (two
  code paths for one concept); transactions not tied to a month row (spec FR-002 needs the
  month status for the closed-month rule anyway).

## R2. Calculation engine (Principle II, SC-005)

- **Decision**: New pure module `packages/shared/src/domain/tracking/`, test-first, used by the
  backend (source of truth) and by the app (optimistic figures, offline totals):
  - `lineActuals(parts)` → per line actual (signed: refunds subtract), `tracked` = at least
    one part.
  - `computeTracking(month, lines, txns, privateAggregates)` → per line / group / month:
    planned, actual, difference, `differencePermille` (null when planned is 0), tracked and
    not-tracked counts, `Unassigned` total. Not-tracked lines are excluded from actual and
    difference, included in "planned (all lines)" (FR-023).
  - `envelopeState(planned, spent)` → `{ remaining (≥ 0), over (≥ 0), progressPermille,
    level: 'ok' | 'warning' | 'over' }`; warning iff `spent × 1000 > planned × 800`, over iff
    `spent > planned` (strict, spec assumption). Planned 0 with spent > 0 → over.
  - `computeBalances(members, sharedTxns, lineShares, settlements)` → net amount per ordered
    pair (R7).
  - `voucherRemaining(voucherIncome, voucherSpending)` (signed).
  - `normalizeLabel`, `suggestLine`, `mostUsedLines` (R6), `findDuplicates` (R11),
    `occurrenceDate(rule, period)` (R9).
- Integer permille only; no floats. Amounts are `bigint`; wire format integer strings, using
  003 `SignedAmountMinor` for actuals, differences, transaction amounts and balances.
- **Property tests**: extend the 003 fast-check setup with a generator of months with 0–300
  transactions (refunds, splits, every payer and method, private lines, unassigned) checked
  against an independent oracle written in the test. Invariants: Σ parts = amount; Σ line
  actuals + unassigned = Σ transaction amounts; balances net to zero across members plus
  settlements; result independent of transaction order.

## R3. Offline recording and sync (FR-014–FR-016, SC-004)

- **Decision**: **Client-generated ids + idempotent `PUT` + TanStack Query persisted
  mutations.**
  - The app generates a UUID v7 for each new transaction. Creation is
    `PUT /budgets/:b/transactions/:id`: first call creates (201); a replay with the same body
    returns the stored row (200); a replay with a different body for an existing id returns
    `409 id_conflict`. Retries can never duplicate (SC-004).
  - Mutations use `mutationKey`s with `setMutationDefaults` registered at start-up, and
    `scope: { id: transactionId }` so create → edit → delete of the same transaction run in
    order. Paused (offline) mutations and the query cache are persisted with
    `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister`
    on `expo-sqlite/kv-store`, and resumed with `resumePausedMutations()` when
    `onlineManager` turns online and after app restart.
  - The month's transaction list and tracking figures shown offline are recomputed on the
    device from the cached data plus pending mutations, with the shared `tracking` functions
    (Principle II: same functions as the server). Pending rows show "En attente de synchro".
  - Sync outcomes the user must decide on (FR-016): `409 month_closed` → dialog "Rouvrir le
    mois" (Owner/Admin) or "Enregistrer ce mois-ci"; `409 stale_state` → 003 conflict dialog;
    a part pointing to a deleted line is accepted by the server as unassigned with
    `needsReview = true` (no error, nothing lost). Failed mutations stay in a "À résoudre"
    list until resolved; they are never discarded silently.
  - Persisted data is cleared on sign-out and account deletion. It contains amounts and labels
    but no secrets, so it lives in the app sandbox (not secure storage); tokens stay in
    `expo-secure-store` (Principle III).
- **Scope of offline**: transactions only (create, edit, delete, receipt photos queued).
  Budget lines and months stay online-only (003 assumption).
- **Alternatives considered**: a hand-written outbox table in `expo-sqlite` (more code doing
  what persisted mutations already do); a sync engine (WatermelonDB, PowerSync, Replicache:
  new infrastructure and a second data model, Principle X); `@react-native-async-storage`
  (not an Expo SDK module; `expo-sqlite/kv-store` exposes the same API).

## R4. Seeing changes within 5 s (FR-021, SC-006)

- **Decision**: Reuse 003 R4. Every transaction, settlement, receipt or recurring write bumps
  the affected month's `revision` in the same transaction (moving a transaction to another
  month bumps both, rows locked in id order). `GET …/months/:m/transactions` and
  `GET …/months/:m/tracking` return `ETag: "<revision>"`; the screens showing them poll every
  2 s with `If-None-Match` while focused and in the foreground.
- Writes take the month row lock (`SELECT … FOR UPDATE`) like 003 mutations, so closing a
  month and recording into it cannot interleave. Volume is low (a few writes a day per
  household).

## R5. Planned vs actual API and the 003 `actuals` field

- **Decision**: New read `GET /budgets/:b/months/:m/tracking` returning `TrackingView`
  (lines, groups, month, envelopes, sub-items, balances, settlements, meal vouchers).
  003 `MonthDetail.actuals` stays **`null`** forever and is marked deprecated: its schema uses
  unsigned `AmountMinor`, and refunds make actuals negative, so filling it would break 003 app
  builds that parse it (Principle VII). The 003 Closed-month screen (FR-037) reads the new
  endpoint. The `ActualsProvider` port and `NullActualsProvider` are removed.
- **Closed months**: transactions of a Closed month cannot change (`409 month_closed`), and
  lines are frozen by 003, so tracking for a Closed month is computed from frozen rows; no
  extra snapshot is stored. Settlements stay allowed on Closed months (paying back after the
  month ends is normal); they are not month edits.
- **Alternatives considered**: a new `actualsV2` field in `MonthDetail` (makes the month
  payload heavier for every poll, and the planning screen does not need balances).

## R6. Line suggestion and "most used" (FR-009, FR-011–FR-013, SC-002)

- **Decision**: Computed **on the device** from a compact hint index, so it works offline and
  adds no latency to quick add.
  - `GET /budgets/:b/transaction-hints` (ETag) returns, over the last 90 days of the budget's
    transactions, excluding transactions on other members' private lines (FR-012):
    `labels[]: { normalizedLabel, seriesId, count, lastUsedAt }`, `mostUsed[]` for the caller
    (`seriesId`, count), and the caller's last payment method per payer. Refetched on app
    focus and after each successful transaction save; persisted with the query cache.
  - `normalizeLabel`: NFKD, strip diacritics, lower-case, collapse spaces, trim. Exact match on
    the normalized label (spec wording "same label"); no fuzzy matching in v1.
  - `suggestLine(label, hints, monthLines)`: series with the highest count for that label,
    ties by most recent; resolved to the line with that `series_id` in the target month,
    else nothing (FR-011). `mostUsedLines(hints, monthLines, me)`: top 6 by count, excluding
    others' personal lines (FR-009).
  - Labels leave the server only to members' own devices, which already see them (Principle
    III is about logs/analytics/third parties).
- **Measuring SC-002**: each save with a suggestion shown sends `suggestion: 'kept' |
  'changed'` in the transaction body; the server increments `suggestion_stat (budget_id,
  membership_id, day, kept, changed)`. No label, amount or line is stored with it (FR-013).
  An internal SQL query gives the acceptance rate; no analytics vendor involved.
- **AI**: none. Rule-based on the household's own data; Principle IX not applicable (FR-013a).
- **Alternatives considered**: server-side suggestion endpoint per keystroke (fails offline,
  adds latency to the < 10 s flow); fuzzy matching (Levenshtein, merchant prefixes like
  "CB LECLERC 12/11"): deferred to CSV import, where bank labels are noisy (R11).

## R7. Balances between members (FR-028–FR-032, clarifications Q1/Q2)

- **Decision**: A transaction creates balance entries when it is shared (shared line part, or
  unassigned with `isShared = true`) **and** paid by a member (any method except joint card;
  meal vouchers included, clarification Q2). For each shared part:
  - weights = the line's planned per-member shares in that month (`budget_line_share`), or
    equal weights over contributing members when the part is unassigned or the line's planned
    total is 0 (clarification Q1);
  - `splitByWeights(|amount|, weights)` (003 largest-remainder rule), sign restored for
    refunds; every non-payer owes the payer their share.
  - Example: Courses planned Maëlle 100 € / Fabien 300 €, Fabien pays 104,47 € →
    weights 1:3 → Maëlle 26,12 €, Fabien 78,35 € → Maëlle owes Fabien 26,12 €.
- **Netting**: per month, per unordered pair: Σ owed A→B − Σ owed B→A − settlements. Shown as
  one statement per non-zero pair, oriented by sign. With > 2 members it stays pairwise (no
  debt simplification across three people; fewer surprises, Principle X).
- **Computed, not stored**: balances are derived on read from transactions + planned shares +
  settlements (pure function). Only `settlement` rows are stored. Editing a settled
  transaction therefore naturally produces a new open balance (FR-031) without touching the
  settlement.
- **Privacy**: a shared transaction is never on a private line (private lines are personal),
  so balance details never expose private data.
- **Alternatives considered**: storing balance entries per transaction (a second source of
  truth that can drift when lines are re-split); global debt simplification (harder to explain
  in a household of two).

## R8. Meal vouchers (FR-033, FR-034)

- **Decision**: Add `is_meal_voucher boolean default false` to 003 `income_line` and an
  optional `isMealVoucher` field to the income contracts (additive, older apps ignore it).
  A meal-voucher income line forces `counts_toward_household = false` (vouchers are not
  household-counted income, 003 example). `voucherRemaining = Σ voucher income lines of the
  member in the month − Σ that member's transactions with method `meal_voucher`` (signed).
- Method rules in shared domain `validatePayment(payer, method)`: `meal_voucher` and
  `personal_card` need a member payer; `joint_card` needs the joint account; `cash` and
  `transfer` work for both.

## R9. Recurring transactions (FR-035–FR-038)

- **Decision**: `recurring_txn_rule` (label, amount, day 1–31, payer, method, `series_id` of
  the line, active). Occurrences are created by:
  1. a **daily job** at 06:00 in each budget's `time_zone` window (cron every hour, picks
     budgets whose local time just passed 06:00; advisory lock, 002 pattern), creating every
     due occurrence with scheduled date ≤ today in existing, non-Closed months;
  2. the 003 **create-month** use case, through a new `RecurringOccurrences` port called in
     the same transaction, which creates the missed occurrences of that period (FR-037).
  - `occurrenceDate(day, period)` clamps to the last day of the calendar month the date falls
    in; periods with a non-1 start day pick the date within the period (shared domain, tested
    on transition months).
  - Exactly once: unique `(rule_id, scheduled_date)` on `txn`; inserts use `ON CONFLICT DO
    NOTHING`.
  - Line missing in the month → transaction unassigned with `needs_review` (FR-037).
    Closed month → no transaction; a `recurring_skip` row is recorded and members get a push
    "Une opération récurrente n'a pas pu être créée" (no label or amount, Principle III).
- Edits and pauses affect only future occurrences (the job reads the rule at run time;
  created rows are ordinary transactions).
- **Alternatives considered**: creating occurrences lazily on read (a month nobody opens
  would never get them; balances and tracking would depend on who looked first).

## R10. Receipt photos (FR-001, FR-049)

- **Decision**: Stored **in PostgreSQL** in `txn_receipt (bytea)`, separate from `txn` so
  lists never load them. On device, photos are taken or picked with `expo-image-picker`, then
  resized to max 1600 px and re-encoded as JPEG q0.7 with `expo-image-manipulator` (typically
  150–400 kB, also strips EXIF/GPS metadata). Server limit 1 MB per photo, 3 photos per
  transaction, `image/jpeg` only.
- Upload: `PUT /budgets/:b/transactions/:id/receipts/:receiptId` (raw body, client id,
  idempotent), queued offline like other mutations. Download: authenticated `GET` with
  `Cache-Control: private, max-age=86400` (immutable by id).
- Deleted with the transaction (FK cascade), and included in the GDPR export (Principle III).
- Volume estimate: 2 households-members × ~20 receipts/month × 300 kB ≈ 12 MB/household/month,
  fine for Postgres at the current scale.
- **Alternatives considered**: S3-compatible object storage (new infrastructure, signed URLs,
  lifecycle rules; worth it later if volume grows, behind a `ReceiptStore` port so it can be
  swapped); storing the original photo (5–10 MB, and keeps GPS EXIF).

## R11. CSV bank import (FR-039–FR-043)

- **Decision**: Parse **on the device** (same reasoning as 003 R16: the raw bank export never
  leaves the phone), commit structured rows through a dry-run/commit endpoint.
  - File picked with `expo-document-picker` (already installed), read with
    `expo-file-system`. Encoding: UTF-8 (with or without BOM), else Windows-1252 (common in
    French bank exports), decoded by a small table in shared domain (Hermes `TextDecoder`
    handles UTF-8 only).
  - CSV parsing: a small RFC 4180 parser in `packages/shared/src/domain/csv/` (quoted fields,
    `;` / `,` / tab detection, CRLF), test-first with real anonymized exports from the main
    French banks as fixtures. No dependency (≈ 80 lines; Principle X).
  - Column mapping: proposed from header keywords (`date`, `libellé`, `montant`, `débit`,
    `crédit`…), confirmed by the user on first use; stored per budget in `bank_csv_mapping`
    keyed by a fingerprint of the normalized header row (FR-040). Dates `DD/MM/YYYY`,
    `YYYY-MM-DD`; amounts through `parseAmount` with sign or debit/credit columns.
  - Line suggestion for bank labels: `normalizeLabel` then strip bank noise (`CB`, `PRLV`,
    `VIR`, card dates like `12/11`, trailing card numbers) before `suggestLine`; same hint
    index as R6.
  - Duplicates (FR-042): `findDuplicates(rows, existing)` = same amount, same payer, date
    within ±3 days; plus an `import_key` (hash of account choice + date + amount + raw label +
    occurrence index within the file) stored on imported transactions, unique per budget, so a
    re-imported row is always flagged.
  - `POST /budgets/:b/transaction-imports` with `dryRun: true` returns server-side duplicate
    flags and month status per row (closed, missing); `dryRun: false` commits all included rows
    in one transaction (all or nothing), cause `import` in history. Closed-month rows follow
    the batch choice: `reopen` (Owner/Admin), `move_to_current`, or `skip`.
- **Alternatives considered**: `papaparse` (fine, but the custom parser is small and the
  encoding handling is needed anyway); OFX/QIF (spec: CSV only); uploading the file.

## R12. Quick add (FR-007–FR-010, Principle IV: < 10 s)

- **Decision**:
  - A floating "+" button rendered by `budgets/[budgetId]/_layout.tsx` above the Stack,
    respecting safe areas, hidden for Viewers and while a sheet is open; also on the app home
    when a current budget is known. Opens `transactions/new` as a `formSheet`.
  - Step 1: a custom in-app **amount keypad** (digits, `,`, ⌫, "Remboursement" toggle) —
    no system keyboard animation, large 64 pt keys, VoiceOver labels. Amount parsed with
    `parseAmount` (comma decimal by locale).
  - Step 2: label field with the system keyboard, autocomplete from hint labels.
  - Step 3: line chips (6 most used, suggested one preselected, "Aucune", "Toutes…"), then
    "Enregistrer". Date, payer, method, sub-item, planned toggle, note, photo are visible as
    compact rows under the chips; tapping one edits it in place.
  - Save is optimistic: haptic success, sheet closes, row appears with "En attente" until the
    server confirms (FR-010); no spinner.
- **Time budget** (Principle IV): sheet open < 300 ms (route preloaded, hints cached);
  ~4 s typing amount + label; 1 tap line; 1 tap save. The biometric app lock (001) runs
  before; it is counted in SC-001 "from opening the app" and takes ~1 s with Face ID.
- **Alternatives considered**: system numeric keypad (`decimal-pad` lacks a comma on some
  Android keyboards and slides in late); a home-screen quick action (useful later, out of
  scope).

## R13. Editing, deleting, history

- **Decision**: `PATCH` with `expectedVersion` (003 R5); changing the date can move the
  transaction to another month (both month rows locked, both revisions bumped, both histories
  get an entry). `DELETE` with `expectedVersion`; the 10 s undo is client-side: the app hides
  the row and sends `DELETE` after 10 s unless undone (a deletion pending when the app is
  killed is persisted with the other mutations and still sent).
- History: `month_change.entity` gains `transaction`, `settlement`, `recurring_rule`;
  `cause` gains `recurring` and `paid_as_planned`. Private-line transactions are recorded with
  `is_private` and redacted for others as "{member} a modifié une opération privée"
  (FR-020). Recurring-rule changes are recorded in the current month's history.
- Unassigning on line deletion (FR-045): the 003 delete-line use case calls a
  `TransactionsForLine` port in its transaction that sets `line_id = null`,
  `needs_review = true` on the parts first (FK is `ON DELETE SET NULL` as a safety net);
  sub-item deletion clears `sub_item_id` (`SET NULL`).

## R14. Permissions

- New permissions in the 002 matrix (`permissions.ts`): `transactions.write` → owner, admin,
  member; `transactions.read` → everyone in the budget. Personal-line transactions are
  editable only by the line owner (`403 not_line_owner`, use case check). Settlements and
  recurring rules use `transactions.write`. Viewers read only.
- Joint account as payer is allowed for every writer; a member as payer can be set by any
  writer (recording what the partner paid is common). This includes `meal_voucher`: the only
  rule is the method/payer rule (R8), and the voucher remaining belongs to the payer.

## R15. GDPR export and deletion (Principle III)

- The 001/002 export gains the caller's budgets' transactions (CSV-friendly JSON),
  settlements, recurring rules and receipt photos (zip entries). Account deletion follows 002:
  budget data stays with the budget; the leaving member's transactions keep their payer
  reference shown as the 002 "former member" name.

## R16. New dependencies (Principle X)

| Package | Where | Why | Alternative rejected |
|---|---|---|---|
| `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister` | mobile | Persist paused mutations and cache for offline (R3) | Hand-written outbox duplicating TanStack behaviour |
| `expo-sqlite` (kv-store) | mobile | Storage for the persister, Expo SDK module | AsyncStorage community package (not Expo SDK) |
| `expo-image-picker`, `expo-image-manipulator` | mobile | Receipt photo capture, resize, EXIF strip (R10) | `expo-camera` (custom camera UI, more code) |

No backend dependency added.
