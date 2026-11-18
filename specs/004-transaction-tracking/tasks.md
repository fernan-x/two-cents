---

description: "Task list for 004-transaction-tracking"
---

# Tasks: Transaction Tracking

**Input**: Design documents from `/specs/004-transaction-tracking/`: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/rest-api.md](./contracts/rest-api.md), [quickstart.md](./quickstart.md)

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. The spec requires property-based recomputation tests (SC-005) and exactly-once sync (SC-004). The constitution requires domain functions written test-first (Principle II) and a non-member refusal test for every budget route (Principle III). Write each test task first and confirm it fails before implementing.

**Organization**: Tasks are grouped by user story (US1–US9 from spec.md) so each story can be implemented and tested on its own.

**Starting point**: 001–003 are implemented. Reused as-is, **not** rebuilt: `parseAmount` (`packages/shared/src/domain/money.ts`), `budgetMonthFor` (`budget-month.ts`), `can` (`permissions.ts`), `splitByWeights` (`packages/shared/src/domain/planning/split.ts`), 003 contracts (`AmountMinor`, `SignedAmountMinor`, `PersonRef`, `MonthStatus`, `ChangeView` in `packages/shared/src/contracts/`), `MonthWriter` + `MonthContext` (`backend/src/planning/application/services/month-writer.ts`: month lock, closed check, revision bump, `record()` history), `MonthDetailView` private-line redaction, `BudgetAccess`/`BudgetAccessGuard`/`@RequirePermission`, `DomainError` + `backend/src/shared-kernel/presentation/http-status.ts`, `ZodValidationPipe`, `TransactionRunner`, `Clock`, `IdGenerator`, advisory-lock jobs (`backend/src/budgets/infrastructure/jobs/budget-jobs.ts` pattern, `LOCK_KEYS`), Expo push sender, the authz suite (`backend/test/authz/budget-route-cases.ts`), e2e helpers (`backend/test/support/{budgets,planning}.ts`), mobile `useMonth` 2 s ETag polling pattern (`mobile/src/features/planning/use-month.ts`), `AmountField`, conflict dialog, `online.ts`, `useSignOut` (`mobile/src/auth/session-actions.ts`), the zip export builder (`backend/src/identity/infrastructure/export/zip-export-builder.ts`), `fast-check`.

## Implementation notes (deviations from the plan)

- **T022, import key is plain text, not a hash.** `importKey()` joins payer, date, amount, normalized label and occurrence index. Every part is already stored on the transaction, so hashing added nothing.
- **T105, one CSV file.** `packages/shared/src/domain/csv/index.ts` holds decode, parse, mapping and rows (~200 lines) instead of four files.
- **T033/T040, hooks instead of ports.** Planning exposes a `PlanningHooks` registry (`lineDeleting`, `monthCreated`), same pattern as 002's `MembershipHooks`. Tracking registers at startup, so planning never imports tracking.
- **T109, export contributor registry.** `BudgetExportContributors` in budgets core; tracking adds `transactions.csv`, `settlements.csv`, `recurring_rules.csv` and `receipts/<txn>/<id>.jpg` to the ZIP.
- **T085, delete undo is a client timer.** The row hides at once and `DELETE` is sent after 10 s unless undone. If the app is killed within those 10 s, the delete is not sent and the row comes back (research R13 planned to persist it).
- **T097, T112 covered by e2e.** The job's exactly-once and local-time behaviour is tested in `test/tracking/us8-9.e2e-spec.ts`; line deletion (FR-045) in `test/tracking/us5-edit.e2e-spec.ts`. No separate files.
- **T057, "+" only inside a budget.** The button shows on budget screens, not on the app home.
- **Typed routes.** New routes are pushed with an `as Href` cast until the next `expo start` regenerates `.expo/types/router.d.ts`.
- **Receipts, EXIF.** Photos are re-encoded with `expo-image-manipulator`; the SDK docs do not state that metadata is dropped. Check on a device (T114).
- **Tests need Node 24.9+** (`~/.local/share/fnm/node-versions/v24.22.3`). Mobile tests use an in-memory mock of `expo-sqlite/kv-store` (`mobile/test/jest-setup.ts`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US9)
- Each description gives exact file paths

## Path Conventions

- Shared: `packages/shared/src/domain/tracking/*.ts`, `packages/shared/src/domain/csv/*.ts`, `packages/shared/src/contracts/*.ts`; tests in `packages/shared/test/tracking/`, `packages/shared/test/csv/`, fixtures in `packages/shared/test/fixtures/`
- Backend: new module `backend/src/tracking/{domain,application,infrastructure,presentation}/`, same layers and ESLint import rules as `backend/src/planning/`. Unit tests colocated `*.spec.ts`; e2e in `backend/test/tracking/*.e2e-spec.ts`
- Mobile: routes in `mobile/src/app/(app)/budgets/[budgetId]/`, feature code in `mobile/src/features/tracking/`, tests colocated `*.test.ts(x)`
- Mobile rule (`mobile/AGENTS.md`): add Expo packages with `npx expo install`, and read the SDK 58 docs before using any Expo API
- Money: bigint minor units in code, integer strings on the wire, never `number` (Principle I). No amounts, labels, notes or photos in logs, analytics or push (Principle III). Every user-facing string goes through i18n (Principle VI)
- Tests need Node 24.9+ (`fnm use 24`); backend e2e via `pnpm --filter two-cents-backend test:e2e`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New mobile dependencies only (research R16). No backend dependency.

- [X] T001 [P] In `mobile/`, run `npx expo install expo-sqlite expo-image-picker expo-image-manipulator` (read the SDK 58 docs for each first; add the camera and photo-library usage strings in French to `mobile/app.json` plugins config for `expo-image-picker`)
- [X] T002 [P] In `mobile/`, add `@tanstack/react-query-persist-client` and `@tanstack/query-async-storage-persister` at the exact versions matching the installed `@tanstack/react-query` 5.x (`pnpm --filter mobile add …`), then run `pnpm install` and confirm `pnpm --filter mobile typecheck` passes
- [X] T003 [P] Create empty module folders and barrels: `packages/shared/src/domain/tracking/index.ts`, `packages/shared/src/domain/csv/index.ts` (re-exported from `packages/shared/src/domain/index.ts`), `backend/src/tracking/` (with `domain/`, `application/`, `infrastructure/`, `presentation/http/`), `mobile/src/features/tracking/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Calculation engine, contracts, schema and migration, the tracking module skeleton (transaction writer, ETag), the 003 hooks, and mobile plumbing. Every story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Domain tests first (Principle II): write them and see them fail

- [X] T004 [P] Write `packages/shared/test/tracking/payment.spec.ts`: `validatePayment(payer, method)` accepts `personal_card`/`meal_voucher` only with a member payer, `joint_card` only with the joint account, `cash`/`transfer` with both; `defaultPlanned(parts)` = `parts.length > 0`; `validateParts(amount, parts)` returns `{ ok }` when Σ parts = amount, `PARTS_MISMATCH` with signed `difference` otherwise, refuses a zero part, a part whose sign differs from the amount, more than one unassigned part, and a zero amount; `defaultMethod(payer, lastMethodByPayer)` = last used, else `joint_card` for joint and `personal_card` for a member (FR-005)
- [X] T005 [P] Write `packages/shared/test/tracking/actuals.spec.ts`: `lineActuals` sums parts per line with refunds subtracting, a line with only a refund is tracked with a negative actual, a line with no part is `actual: null` ("not tracked"); `computeTracking` per line gives `difference = actual − planned` and `differencePermille` (integer, half-up, `null` when planned is 0), per group and month gives `plannedAll`, `plannedTracked`, `actual`, `difference`, `differencePermille`, `notTrackedCount`, excludes not-tracked lines from actual and difference (FR-023), puts unassigned transactions in `unassigned` and in the month actual but in no group (FR-024), and aggregates other members' private lines into `privateAggregates` per member (planned + actual)
- [X] T006 [P] Write `packages/shared/test/tracking/envelope.spec.ts`: `envelopeState(planned, spent)`: 400 €/250 € → remaining 150 €, progress 625‰, `ok`; 400/320 → exactly 800‰, `ok` (strict); 400/330 → 825‰, `warning`; 400/400 → remaining 0, `warning` not `over`; 400/420 → remaining 0, over 20 €, `over`; planned 0 / spent 5 € → `over`; negative spent (refunds) → remaining = planned, progress 0; sub-item state with and without an amount (FR-026, FR-027)
- [X] T007 [P] Write `packages/shared/test/tracking/balances.spec.ts`: Courses planned Maëlle 100 € / Fabien 300 €, Fabien pays 104,47 € with `personal_card` → Maëlle owes Fabien 26,12 € (clarification Q1); same with `meal_voucher` → same debt (Q2); joint payer → no balance; personal-line part → no balance; unassigned with `isShared` → equal split over contributing members; line planned total 0 → equal split; refund of 20 € reverses 5,00 €; split transaction uses each part's own line weights; amounts owed in both directions net to one statement per pair; settlements subtract; 3 members stay pairwise; remainder cents follow `splitByWeights` (largest remainder, ties by member order); result independent of transaction order
- [X] T008 [P] Write `packages/shared/test/tracking/vouchers.spec.ts`: `voucherRemaining` = Σ meal-voucher income − Σ that member's `meal_voucher` transactions (160 € − 12,50 € − 45,00 € = 102,50 €), negative allowed, refunds paid in vouchers add back, other members' voucher spending ignored (FR-033)
- [X] T009 [P] Write `packages/shared/test/tracking/suggest.spec.ts`: `normalizeLabel` (`"LECLERC "`, `"Leclerc"`, `"lèclerc"` → `"leclerc"`; collapses inner spaces; NFKD + diacritics stripped); `suggestLine(label, hints, monthLines)` picks the series with the highest count for that normalized label, ties by most recent `lastUsedAt`, returns the line of that `seriesId` in the month or `null` when absent or label unknown (FR-011); `mostUsedLines(hints, monthLines, me)` returns at most 6 lines ordered by count, excluding other members' personal lines (FR-009); `stripBankNoise` removes `CB`, `PRLV`, `VIR`, `CARTE`, dates like `12/11`, trailing card numbers `X1234` (R11)
- [X] T010 [P] Write `packages/shared/test/tracking/recurring.spec.ts`: `occurrenceDate(dayOfMonth, period)` for start day 1 (day 31 in November → 30 Nov; in February → 28/29 Feb), for a non-1 start day (28 Oct–27 Nov period with day 5 → 5 Nov; day 30 → 30 Oct), for 002 transition periods (fixtures from `budget-month` tests); `dueOccurrences(rule, period, today)` returns dates ≤ today within the period and ≥ `startsOn`, empty when the rule is paused
- [X] T011 [P] Write `packages/shared/test/tracking/duplicates.spec.ts`: `findDuplicates(rows, existing)` flags a row with same amount, same payer and date within ±3 days (inclusive), not at 4 days, not with a different payer; one existing transaction matches at most one row; flags rows whose `importKey` is already used; `importKey(account, date, amount, rawLabel, occurrenceIndex)` is stable and differs for two identical purchases in the same file (occurrence index)
- [X] T012 [P] Write the property test `packages/shared/test/tracking/tracking.property.spec.ts` with fast-check: generator of months (1–6 members, 0–80 lines incl. envelopes, sub-items, private and personal lines, all split modes) and 0–300 transactions (refunds, splits of 2–3 parts, unassigned shared/personal, every payer and method, amounts generated as typed strings fed through `parseAmount`); ≥ 1 000 runs checked against an **independent oracle written in the test** (naive loops, no production helper): every line actual, group/month totals, `notTrackedCount`, envelope remaining/over, voucher remaining, pairwise balances, to the cent. Invariants: Σ line actuals + unassigned = Σ transaction amounts; Σ balances owed and received net to 0 over members; results independent of transaction order (SC-005)
- [X] T013 [P] Create fixture `packages/shared/test/fixtures/novembre-2026-actuals.ts` (Novembre 2026 plan from the 003 fixture + the quickstart transactions: Courses 250/80/90, Fabien 104,47 € on Courses, Maëlle vouchers 12,50 € + 45,00 €) and a regression spec `packages/shared/test/tracking/novembre-2026.spec.ts` asserting 82,5 % warning, "+20,00 €" over, Maëlle owes Fabien 26,12 €, voucher remaining 102,50 €

### Domain implementation

- [X] T014 [P] Implement `packages/shared/src/domain/tracking/types.ts` (types from data-model.md "Shared domain types": `Payer`, `PaymentMethod`, `TxPart`, `Tx`, `LineTracking`, `EnvelopeState`, `Totals`, `Balance`, `VoucherState`) and `errors.ts` (`PARTS_MISMATCH`, `INVALID_PAYMENT_METHOD`)
- [X] T015 [P] Implement `packages/shared/src/domain/tracking/payment.ts` (`validatePayment`, `defaultPlanned`, `validateParts`, `defaultMethod`) until T004 passes
- [X] T016 [P] Implement `packages/shared/src/domain/tracking/actuals.ts` (`lineActuals`, `computeTracking`, `permille(a, b)` integer half-up, no floats) until T005 passes
- [X] T017 [P] Implement `packages/shared/src/domain/tracking/envelope.ts` (`envelopeState`, `subItemState`) until T006 passes: warning iff `spent × 1000 > planned × 800`, over iff `spent > planned`
- [X] T018 [P] Implement `packages/shared/src/domain/tracking/balances.ts` (`computeBalances(members, txns, lineShares, settlements)`) reusing `splitByWeights` from `../planning/split` on `|amount|` with sign restored, until T007 passes
- [X] T019 [P] Implement `packages/shared/src/domain/tracking/vouchers.ts` until T008 passes
- [X] T020 [P] Implement `packages/shared/src/domain/tracking/suggest.ts` (`normalizeLabel`, `stripBankNoise`, `suggestLine`, `mostUsedLines`) until T009 passes
- [X] T021 [P] Implement `packages/shared/src/domain/tracking/recurring.ts` (`occurrenceDate`, `dueOccurrences`) using `budgetMonthFor` periods, until T010 passes
- [X] T022 [P] Implement `packages/shared/src/domain/tracking/duplicates.ts` (`findDuplicates`, `importKey` as SHA-256 hex via a pure JS implementation usable on Hermes and Node, or the existing hash helper if `packages/shared` has one) until T011 passes
- [X] T023 Export everything from `packages/shared/src/domain/tracking/index.ts`; run T012 and T013 until they pass (fix production code, never the oracle)
- [X] T024 Add `transactions.read` (owner, admin, member, viewer) and `transactions.write` (owner, admin, member) to the matrix in `packages/shared/src/domain/permissions.ts` and extend its existing spec

### Contracts (Principle VII)

- [X] T025 [P] Create `packages/shared/src/contracts/transactions.ts` with Zod schemas from contracts/rest-api.md: `Payer`, `PaymentMethod`, `TxPartInput`, `TxOrigin`, `TransactionCreate` (`label` 1–60 after trim, `note` ≤ 500, `amountMinor` `SignedAmountMinor` ≠ `"0"` and |amount| ≤ `100000000`, `origin` restricted to `quick_add | edit_form | import` on input, `suggestion?: 'kept' | 'changed'`), `TransactionPatch` (+ `expectedVersion`), `TransactionView` and its private variant (discriminated by `private: true`, no label/amount/note/parts/receipts), `MonthTransactionsView`
- [X] T026 [P] Create `packages/shared/src/contracts/tracking.ts` (`Totals`, `LineTrackingView`, `EnvelopeView`, `TrackingView` exactly as contracts/rest-api.md) and `settlements.ts` (`SettlementCreate`, `SettlementView`)
- [X] T027 [P] Create `packages/shared/src/contracts/transaction-hints.ts` (`TransactionHints`), `recurring.ts` (`RecurringRuleCreate` with `dayOfMonth` int 1–31, `RecurringRulePatch`, `RecurringRuleView`) and `transaction-imports.ts` (`CsvMapping`, `TransactionImportRequest` with ≤ 1 000 rows, `TransactionImportResult`)
- [X] T028 Extend 003 contracts additively: `isMealVoucher?: boolean` (default `false`) on income line input/view in `packages/shared/src/contracts/income.ts`; `ChangeView.entity` + `transaction | settlement | recurring_rule` and `cause` + `recurring | paid_as_planned` in `packages/shared/src/contracts/months.ts`; mark `MonthDetail.actuals` deprecated in a JSDoc comment (always `null`, research R5); export new modules from `packages/shared/src/contracts/index.ts`
- [X] T029 Add the new error codes to `packages/shared/src/contracts/errors.ts` and their statuses to `backend/src/shared-kernel/presentation/http-status.ts`: `PARTS_MISMATCH` 400, `LINE_NOT_IN_MONTH` 400, `INVALID_PAYMENT_METHOD` 400, `ID_CONFLICT` 409, `RECEIPT_TOO_LARGE` 413, `TOO_MANY_RECEIPTS` 409, `SETTLEMENT_EXCEEDS_BALANCE` 400; extend `MONTH_NOT_FOUND` body with `{ periodStart, canCreate }` and `MONTH_CLOSED` body with `{ monthStart, canReopen }`

### Schema and migration

- [X] T030 Add Drizzle schema `backend/src/shared-kernel/infrastructure/db/schema/tracking.ts` (export from `schema/index.ts`) for `txn`, `txn_part`, `txn_receipt`, `settlement`, `recurring_txn_rule`, `recurring_skip`, `bank_csv_mapping`, `suggestion_stat` with every column, check, unique and index from data-model.md, notably: `txn` checks `amount_minor <> 0`, `(amount_minor < 0) = is_refund`, label 1–60, note ≤ 500, `payment_method <> 'joint_card' OR payer_membership_id IS NULL`, `payment_method NOT IN ('personal_card','meal_voucher') OR payer_membership_id IS NOT NULL`; unique `(recurring_rule_id, scheduled_date)` where not null; unique `(budget_id, import_key)` where not null; `txn_part.line_id` and `sub_item_id` `ON DELETE SET NULL`; `txn_receipt.bytes` ≤ 1 048 576; `settlement.amount_minor > 0` and `from <> to`; `recurring_txn_rule.day_of_month` 1–31; plus `income_line.is_meal_voucher boolean default false` with check `NOT is_meal_voucher OR NOT counts_toward_household` in `schema/planning.ts`
- [X] T031 Write migration `backend/drizzle/0007_transactions.sql` (generate with drizzle-kit, then hand-add): the **deferrable constraint trigger** (initially deferred) checking Σ `txn_part.amount_minor` = `txn.amount_minor` for each touched txn having ≥ 1 part, and at most one part with `line_id IS NULL`; enum value additions on `month_change.entity` and `month_change.cause`; register it in the Drizzle journal
- [X] T032 Write `backend/test/tracking/migration.e2e-spec.ts`: migration applies on a database migrated to 0006; the Σ parts trigger rejects a mismatching commit; the payer/method checks reject `joint_card` with a member payer; deleting a line nulls `txn_part.line_id`

### Backend module skeleton

- [X] T033 Refactor `backend/src/planning/application/services/month-writer.ts`: add `run<T>(auth, budgetId, monthStart, permission, work: (ctx) => Promise<T>, options)` doing the same lock/closed-check/revision bump/history without building `MonthDetail`, and make `write` delegate to it; add `MonthContext.lineShares` access if not present; keep `month-writer.spec.ts` green and add a case for `run`
- [X] T034 Remove `ActualsProvider`, `ACTUALS_PROVIDER` and `backend/src/planning/infrastructure/null-actuals.provider.ts`; make `MonthDetailView` always set `actuals: null`; export from `planning-core.module.ts` what tracking needs (`MonthWriter`, `MONTH_REPOSITORY`, `LINE_REPOSITORY`, `INCOME_LINE_REPOSITORY`)
- [X] T035 Define tracking domain entities and ports in `backend/src/tracking/domain/entities/transaction.ts` (create/patch rules: `validatePayment`, `validateParts`, `defaultPlanned`, `planned_set_by_hand`, `is_shared` derived from parts, version bump) and `backend/src/tracking/domain/ports/repositories.ts` (`TransactionRepository`: `findById`, `listForMonth`, `insert`, `update`, `delete`, `unassignLine(lineId)`, `hintsSince(budgetId, since)`; `ReceiptStore`; `SettlementRepository`; `RecurringRuleRepository`; `CsvMappingRepository`; `SuggestionStats`) with symbols
- [X] T036 Implement Drizzle repositories in `backend/src/tracking/infrastructure/persistence/` (`drizzle-transaction.repository.ts` loading parts in one query and never selecting receipt bytes; `drizzle-other.repositories.ts` for the rest) with mappers to/from bigint
- [X] T037 Implement `backend/src/tracking/application/services/txn-writer.ts`: wraps `MonthWriter.run` with `transactions.write`; loads the month by the transaction date (`budgetMonthFor` with the budget start day and `time_zone`), throws `MONTH_NOT_FOUND { periodStart, canCreate }` / `MONTH_CLOSED { monthStart, canReopen }`; checks every part's line and sub-item belong to that month (`LINE_NOT_IN_MONTH`) and personal-line ownership (`NOT_LINE_OWNER`); records `month_change` with entity `transaction`, `is_private` from the line; locks two months in id order when a transaction moves
- [X] T038 Implement `backend/src/tracking/application/services/tracking-view.ts`: builds `TransactionView` (private variant for other members' private-line transactions, `can.edit/delete`) and `TrackingView` by calling shared `computeTracking`, `envelopeState`, `computeBalances`, `voucherRemaining` (never re-implementing them)
- [X] T039 Create `backend/src/tracking/tracking.module.ts` (imports `PlanningCoreModule`, budgets core; binds repositories) and register it in `backend/src/app.module.ts`
- [X] T040 Add two ports owned by planning and implemented by tracking: `TransactionsForLine.unassign(lineId)` called by `Lines.remove` in `backend/src/planning/application/use-cases/lines.ts` before deleting the line (sets `line_id = null`, `needs_review = true`; FR-045) and `RecurringOccurrences.materializeForMonth(ctx)` called by `CreateMonth.execute` in `backend/src/planning/application/use-cases/months.ts` inside its transaction; no-op default bindings in planning, real bindings registered by `tracking.module.ts`

### Mobile plumbing

- [X] T041 [P] Create `mobile/src/features/tracking/query-keys.ts` (`trackingKeys.transactions(budgetId, monthStart)`, `.tracking(...)`, `.hints(budgetId)`, `.recurring(budgetId)`) and `mobile/src/features/tracking/api.ts` (typed calls for every route in contracts/rest-api.md, responses parsed with the shared Zod schemas)
- [X] T042 [P] Create `mobile/src/features/tracking/persist.ts`: `expo-sqlite/kv-store` storage, `createAsyncStoragePersister`, `PersistQueryClientProvider` wiring in `mobile/src/app/_layout.tsx` (persist only `trackingKeys` queries and tracking mutations, `maxAge` 7 days, `buster` = app version), `clearPersistedTracking()` called from `useSignOut` in `mobile/src/auth/session-actions.ts` and from account deletion
- [X] T043 [P] Add i18n keys (fr + en) under `tracking.*` in `mobile/src/i18n/fr.json` and `en.json`: payment methods (Carte perso, Carte commune, Titre-restaurant, Espèces, Virement), payer "Compte commun", "Prévu"/"Imprévu", "Non suivi", "Non affectée", "Payé comme prévu", "Dépassement", "Attention", "En attente de synchro", "À résoudre", "Remboursement", balance sentence `{{from}} doit {{amount}} à {{to}}`, "Marquer comme réglé", closed-month dialog, history sentences for transaction/settlement/recurring entities and the private variant "{{member}} a modifié une opération privée"
- [X] T044 Extend `mobile/src/features/planning/history-sentence.ts` (+ test) to render the new `ChangeView` entities and causes

**Checkpoint**: Domain green (incl. property test), schema migrated, module boots, mobile persists cache — user stories can begin

---

## Phase 3: User Story 1 - Record a transaction in a few seconds (Priority: P1) 🎯 MVP

**Goal**: "+" from any screen → keypad → label → line chip → save, optimistic, < 10 s.

**Independent Test**: quickstart scenario 1–2: record 42,30 € "Leclerc" on Courses; stored today, payer = me, planned, Courses actual +42,30 €; under 10 s.

### Tests for User Story 1

- [X] T045 [P] [US1] Write `backend/test/tracking/us1-record.e2e-spec.ts`: `PUT /v1/budgets/:b/transactions/:id` creates (201) with defaults (planned when parts, unplanned when none, method default); identical replay → 200 same row, one row in DB; different body same id → `409 id_conflict`; `404 month_not_found` with `canCreate`; `409 month_closed` with `canReopen`; `400 parts_mismatch` with signed difference; `400 line_not_in_month`; `400 invalid_payment_method`; `403 not_line_owner` on another member's personal line; Viewer → 403; month revision bumped and `month_change` row written; `GET …/months/:m/transactions` returns it with `ETag`, `304` with `If-None-Match`
- [X] T046 [P] [US1] Write `backend/test/tracking/privacy.e2e-spec.ts`: Maëlle records on her private line; for Fabien, the JSON of `GET transactions`, `GET tracking`, `GET transaction-hints`, history and `GET receipts/:id` never contains the label, the amount string, the note, or the receipt bytes (string search), and the private variant is returned
- [X] T047 [P] [US1] Add every new route of contracts/rest-api.md to `backend/test/authz/budget-route-cases.ts` (writes `viewer: 'forbidden'` with a valid body, reads `viewer: 'allowed'`) so `route-coverage.e2e-spec.ts` covers non-member 404 and Viewer 403
- [X] T048 [P] [US1] Write `mobile/src/features/tracking/amount-keypad.test.tsx`: digits, `,`, ⌫, max two decimals, "Remboursement" toggle makes the value negative, `12,555` blocked with an inline error, every key has an accessibility label, keys ≥ 44 pt
- [X] T049 [P] [US1] Write `mobile/src/features/tracking/quick-add.test.tsx`: opens with keypad focused; amount → label → chips (≤ 6 + "Aucune" + "Toutes…"); date today, payer me, method default; save calls the mutation once with a client UUID v7, closes the sheet, triggers haptic; sub-item picker shown only for lines with sub-items; Viewer never sees the "+" button

### Implementation for User Story 1

- [X] T050 [US1] Implement `backend/src/tracking/application/use-cases/put-transaction.ts` (idempotent create by client id, compare stored vs incoming normalized body for replay, unknown line → stored as unassigned part with `needs_review` per FR-016, `suggestion` counter forwarded to `SuggestionStats`, origin `quick_add | edit_form`) using `TxnWriter`
- [X] T051 [US1] Implement `backend/src/tracking/application/use-cases/list-transactions.ts` (`revision` for ETag + all month transactions newest first, through `tracking-view.ts`, permission `transactions.read`)
- [X] T052 [US1] Implement `backend/src/tracking/presentation/http/transactions.controller.ts`: `PUT /v1/budgets/:budgetId/transactions/:txnId` (201/200), `GET /v1/budgets/:budgetId/months/:monthStart/transactions` with `ETag`/`If-None-Match` → 304 (same helper as the 003 months controller), Zod validation pipe; T045 passes
- [X] T053 [P] [US1] Implement `mobile/src/features/tracking/amount-keypad.tsx` (custom keypad from design tokens, `parseAmount` on the composed string, refund toggle) until T048 passes
- [X] T054 [P] [US1] Implement `mobile/src/features/tracking/line-chips.tsx` (most-used lines from `mostUsedLines` over the month's lines; until hints exist in US4 fall back to month line order; "Aucune", "Toutes…" opening a searchable list grouped by DI/DCR/DCE; excludes others' personal lines)
- [X] T055 [US1] Implement `mobile/src/features/tracking/mutations.ts`: `useCreateTransaction` with `mutationKey ['tracking','create']`, `scope: { id: txnId }`, optimistic insert into `trackingKeys.transactions`, invalidate `tracking` on settle; register defaults via `queryClient.setMutationDefaults` at start-up (needed by US3)
- [X] T056 [US1] Implement the quick-add sheet `mobile/src/app/(app)/budgets/[budgetId]/transactions/new.tsx` (keypad → label → chips → compact rows for date, payer incl. "Compte commun", method, sub-item, planned toggle, note; save with `Haptics.notificationAsync(Success)`; month resolved from the date with `budgetMonthFor`; `404 month_not_found` → offer "Créer le mois à partir du précédent" calling the 003 create-month API, then retry) and register it as a `formSheet` in `mobile/src/app/(app)/budgets/[budgetId]/_layout.tsx` until T049 passes
- [X] T057 [US1] Implement `mobile/src/features/tracking/quick-add-button.tsx` (floating "+", safe-area aware, 56 pt, accessibility label "Ajouter une dépense", hidden for Viewers and while a sheet is presented) and render it in `mobile/src/app/(app)/budgets/[budgetId]/_layout.tsx` and on the app home `mobile/src/app/(app)/index.tsx` for the current budget
- [X] T058 [US1] Receipt photo + note on the quick-add sheet: `mobile/src/features/tracking/receipts.ts` (`expo-image-picker` camera/library, `expo-image-manipulator` resize to max 1600 px, JPEG q0.7, metadata stripped) — uploads are implemented in US5 (T086); in US1 the photo is queued locally and attached after creation

**Checkpoint**: A member records transactions online in < 10 s; partner sees them in the list via polling

---

## Phase 4: User Story 2 - See planned vs actual and envelope progress (Priority: P1)

**Goal**: Per line/group/month planned, actual, difference; envelopes with progress, 80 %/100 % states; "not tracked"; "Paid as planned".

**Independent Test**: quickstart scenarios 3–4.

### Tests for User Story 2

- [X] T059 [P] [US2] Write `backend/test/tracking/us2-tracking.e2e-spec.ts`: `GET /v1/budgets/:b/months/:m/tracking` figures match the Novembre fixture (T013), not-tracked lines excluded from actual/difference and counted, unassigned row, `ETag`/304; `POST …/lines/:lineId/paid-as-planned` creates the FR-025 transaction (amount = planned total, label = line label, today in budget time zone, joint/transfer for shared, owner/personal_card for personal, planned, origin `paid_as_planned`), idempotent on `txnId`, `409 month_closed`; Closed month tracking still readable and unchanged
- [X] T060 [P] [US2] Write `mobile/src/features/tracking/envelope-card.test.tsx`: renders spent/remaining/progress, warning icon + text at 82,5 %, "Dépassement +20,00 €" icon + text at 420/400, progress bar exposes `accessibilityValue`, works at the largest font scale

### Implementation for User Story 2

- [X] T061 [US2] Implement `backend/src/tracking/application/use-cases/get-tracking.ts` (loads month lines + shares + sub-items, transactions, settlements, incomes; delegates to `tracking-view.ts`; `revision` for ETag) and `backend/src/tracking/presentation/http/tracking.controller.ts` (`GET …/tracking` with 304)
- [X] T062 [US2] Implement `backend/src/tracking/application/use-cases/paid-as-planned.ts` and its route in `tracking.controller.ts` (`POST /v1/budgets/:budgetId/months/:monthStart/lines/:lineId/paid-as-planned`, history cause `paid_as_planned`) until T059 passes
- [X] T063 [P] [US2] Implement `mobile/src/features/tracking/use-tracking.ts` (2 s ETag polling while focused, same pattern as `useMonth`) and `use-month-transactions.ts`
- [X] T064 [P] [US2] Implement `mobile/src/features/tracking/envelope-card.tsx` until T060 passes, and `tracking-row.tsx` (planned / actual / difference + %, "Non suivi" badge with "Payé comme prévu" button, haptic on success)
- [X] T065 [US2] Implement `mobile/src/app/(app)/budgets/[budgetId]/months/[monthStart]/tracking.tsx` (month totals header, envelopes first, groups DI/DCR/DCE with totals and `notTrackedCount`, "Privé" rows from `privateAggregates`, "Non affectée" row) and `months/[monthStart]/envelope/[lineId].tsx` (envelope detail: progress, sub-items, its transactions newest first); register both in the budget `_layout.tsx`; add a "Suivi" entry on the 003 month screen `months/[monthStart]/index.tsx` and make the Closed-month view (003 FR-037) link to it

**Checkpoint**: MVP complete (US1 + US2): record and compare against the plan

---

## Phase 5: User Story 3 - Record offline and sync later (Priority: P1)

**Goal**: Transactions recorded offline survive restarts and sync exactly once.

**Independent Test**: quickstart scenarios 5–6.

### Tests for User Story 3

- [X] T066 [P] [US3] Write `mobile/src/features/tracking/offline-queue.test.tsx`: with `onlineManager` offline, two creates are paused, persisted, restored after re-creating the `QueryClient` from the persister, shown "En attente de synchro", and counted in `useOfflineTracking` totals; going online resumes them in order per scope; a replay after a lost response does not duplicate (mock server returns 200 same row)
- [X] T067 [P] [US3] Write `backend/test/tracking/us3-sync.e2e-spec.ts`: 100 creates each sent twice concurrently → 100 rows (SC-004); create on a line deleted meanwhile → stored unassigned with `needsReview`; month closed meanwhile → `409 month_closed`; edit with stale version → `409 stale_state` with `current`

### Implementation for User Story 3

- [X] T068 [US3] In `mobile/src/features/tracking/mutations.ts`, register `setMutationDefaults` for create/patch/delete/receipt-upload before `PersistQueryClientProvider` restores, persist paused mutations, call `queryClient.resumePausedMutations()` on `onlineManager` online and after restore (`onSuccess` of the provider)
- [X] T069 [US3] Implement `mobile/src/features/tracking/use-offline-tracking.ts`: merges cached month data with pending mutation variables and recomputes figures with shared `computeTracking`/`envelopeState` (Principle II), used by the tracking screen and the list when offline or pending
- [X] T070 [P] [US3] Implement `mobile/src/features/tracking/sync-badge.tsx` ("En attente de synchro", icon + text) and an "À résoudre" list `mobile/src/app/(app)/budgets/[budgetId]/transactions/pending.tsx` for failed mutations (never discarded silently, FR-016)
- [X] T071 [US3] Implement `mobile/src/features/tracking/closed-month-dialog.tsx` (on `409 month_closed`: "Rouvrir le mois" when `canReopen` → 003 reopen API then retry; "Enregistrer ce mois-ci" → retry with today's date; "Annuler" keeps it in "À résoudre") and wire the 003 conflict dialog for `409 stale_state` on transactions
- [X] T072 [US3] Allow the quick-add sheet and the tracking/list screens to work offline: do not disable them with the 003 offline banner (`mobile/src/features/planning/offline-banner.tsx` stays for planning screens only); offline the month for a date with no cached month shows "Mois inconnu hors ligne" and keeps the transaction pending

**Checkpoint**: P1 complete — fast, offline-safe recording with planned vs actual

---

## Phase 6: User Story 4 - Line suggested from the label (Priority: P2)

**Goal**: Typing "Leclerc" preselects Courses; acceptance rate measurable.

**Independent Test**: quickstart scenario 7.

### Tests for User Story 4

- [X] T073 [P] [US4] Write `backend/test/tracking/us4-hints.e2e-spec.ts`: `GET /v1/budgets/:b/transaction-hints` returns label counts by `seriesId` over 90 days (older excluded), `mostUsed` and `lastMethodByPayer` for the caller only, excludes other members' private-line transactions, `ETag`/304; a create with `suggestion: 'kept'`/`'changed'` increments `suggestion_stat` for that day, with no label/amount/line stored
- [X] T074 [P] [US4] Write `mobile/src/features/tracking/suggestion.test.tsx`: typing "LECLERC " preselects Courses; unknown label preselects nothing; changing the chip sends `suggestion: 'changed'`

### Implementation for User Story 4

- [X] T075 [US4] Implement `backend/src/tracking/application/use-cases/get-hints.ts` (single grouped SQL over `txn` + `txn_part` + `budget_line.series_id` since now − 90 days, private-line filter, caller-specific parts) and `backend/src/tracking/presentation/http/hints.controller.ts` (`GET /v1/budgets/:budgetId/transaction-hints`, ETag = hash of max `updated_at` + membership id)
- [X] T076 [US4] Implement `backend/src/tracking/infrastructure/persistence/drizzle-suggestion-stats.ts` (upsert `kept`/`changed` counters per `(budget_id, membership_id, day)`) and add an internal SQL query for SC-002 to `specs/004-transaction-tracking/quickstart.md` (acceptance rate over the last 30 days)
- [X] T077 [US4] Implement `mobile/src/features/tracking/use-hints.ts` (fetched on app focus and after each successful save, persisted) and wire `suggestLine` + `mostUsedLines` + `defaultMethod` into `line-chips.tsx` and `transactions/new.tsx` (label autocomplete from hint labels) until T074 passes

**Checkpoint**: Quick add needs only amount + label for known merchants

---

## Phase 7: User Story 5 - Browse, edit and delete the month's transactions (Priority: P2)

**Goal**: Filtered list, edit any field, delete with undo, receipts, partner sees changes.

**Independent Test**: quickstart scenarios 8–9, 14–15.

### Tests for User Story 5

- [X] T078 [P] [US5] Write `backend/test/tracking/us5-edit.e2e-spec.ts`: `PATCH` changes each field with `expectedVersion`, moving the date to another open month moves it and bumps both revisions with history in both months; refund via negative amount; split into 2 parts (90 € + 30 €) accepted, 90 + 20 → `400 parts_mismatch` with 10,00 € difference; `planned_set_by_hand` kept when the line changes; `DELETE` → 204 and second `DELETE` → 204; stale version → 409; history rows with old/new values; personal-line transaction edited by another member → 403
- [X] T079 [P] [US5] Write `backend/test/tracking/receipts.e2e-spec.ts`: `PUT …/receipts/:id` JPEG ≤ 1 MB → 201, replay → 200, > 1 MB → 413, 4th → `409 too_many_receipts`, non-JPEG → 400; `GET` returns bytes with `Cache-Control: private`; private-line receipt → 404 for others; deleting the transaction deletes receipts
- [X] T080 [P] [US5] Write `mobile/src/features/tracking/transaction-list.test.tsx`: filters (member involved, payer, line, group, planned/unplanned, pending) combine with AND, label search uses `normalizeLabel`, total of listed items updates, day grouping, delete hides the row and sends `DELETE` only after 10 s unless "Annuler" is tapped

### Implementation for User Story 5

- [X] T081 [US5] Implement `backend/src/tracking/application/use-cases/patch-transaction.ts` and `delete-transaction.ts` (version check, move between months, idempotent delete, history with snapshot) and routes `PATCH`/`DELETE /v1/budgets/:budgetId/transactions/:txnId` in `transactions.controller.ts` until T078 passes
- [X] T082 [US5] Implement `backend/src/tracking/application/use-cases/receipts.ts` (≤ 3 per txn, ≤ 1 048 576 bytes, `image/jpeg` only, behind the `ReceiptStore` port) and `backend/src/tracking/presentation/http/receipts.controller.ts` (`PUT` raw body with a route-level body limit of 1 MB, `GET`, `DELETE`) until T079 passes
- [X] T083 [P] [US5] Implement `mobile/src/features/tracking/transaction-filters.ts` (pure filter + search + total, tested by T080) and `transaction-row.tsx` (date, label, amount via the amount component, line or "Non affectée", payer, Prévu/Imprévu, sync badge, "Privé" variant)
- [X] T084 [US5] Implement `mobile/src/app/(app)/budgets/[budgetId]/months/[monthStart]/transactions.tsx` (grouped by day, filter sheet, search field, total, 2 s polling) until T080 passes; link it from the month screen and the tracking screen
- [X] T085 [US5] Implement `mobile/src/app/(app)/budgets/[budgetId]/transactions/[txnId].tsx` (detail + edit form reusing keypad, chips, split editor with "Ajouter une ligne" and live difference, receipts gallery, note; save with `expectedVersion`; delete with confirmation then 10 s undo toast) and `usePatchTransaction`/`useDeleteTransaction`/`useUploadReceipt` in `mutations.ts` (scoped by txn id, offline-capable)
- [X] T086 [US5] Wire receipt upload after create in `receipts.ts` (queued `PUT` per receipt with a client id, after the create mutation of the same scope)

**Checkpoint**: Mistakes are fixable; receipts attached

---

## Phase 8: User Story 6 - Shared expense paid personally and who owes whom (Priority: P2)

**Goal**: Netted balance per pair using the line's planned split; mark as settled.

**Independent Test**: quickstart scenario 10.

### Tests for User Story 6

- [X] T087 [P] [US6] Write `backend/test/tracking/us6-balances.e2e-spec.ts`: Fabien pays 104,47 € on Courses (planned 100/300) → `balances` = Maëlle → Fabien 26,12 €; unassigned with `isShared: true` → equal split; joint payer → none; `POST …/settlements` 26,12 € → balance 0 and settlement listed; edit the transaction to 120 € → new open balance 3,88 €, settlement unchanged; settlement above the open balance → `400 settlement_exceeds_balance`; settlement allowed on a Closed month; history entry with entity `settlement`
- [X] T088 [P] [US6] Write `mobile/src/features/tracking/balance-card.test.tsx`: sentence "Maëlle doit 26,12 € à Fabien", list of the transactions behind it, "Marquer comme réglé" confirmation and haptic, "Équilibré" when no balance

### Implementation for User Story 6

- [X] T089 [US6] Implement `backend/src/tracking/application/use-cases/settlements.ts` (open balance recomputed with `computeBalances` under the month lock, amount check, `MonthWriter.run` with `allowClosed: true` for this write only) and `backend/src/tracking/presentation/http/settlements.controller.ts` (`POST /v1/budgets/:budgetId/months/:monthStart/settlements`)
- [X] T090 [P] [US6] Add the "Pour le foyer" toggle (`isShared`, default off) to the quick-add sheet and the edit form, shown only when no line is chosen (FR-028)
- [X] T091 [US6] Implement `mobile/src/features/tracking/balance-card.tsx` until T088 passes and show it on the tracking screen and on the budget home `mobile/src/app/(app)/budgets/[budgetId]/index.tsx` when a balance is open

**Checkpoint**: Household can rebalance without memory

---

## Phase 9: User Story 7 - Meal-voucher spending (Priority: P3)

**Goal**: Voucher spending counted against the member's voucher income; remaining shown.

**Independent Test**: quickstart scenario 11.

### Tests for User Story 7

- [X] T092 [P] [US7] Write `backend/test/tracking/us7-vouchers.e2e-spec.ts`: income line with `isMealVoucher: true` is stored with `countsTowardHousehold: false` even if `true` was sent; tracking `vouchers` for Maëlle = 160 − 12,50 − 45,00 = 102,50 €; overspending → negative; `meal_voucher` with joint payer → 400; shared voucher spending creates a debt like a card (clarification Q2)

### Implementation for User Story 7

- [X] T093 [US7] Extend `backend/src/planning/application/use-cases/income-lines.ts` and the Drizzle income repository for `is_meal_voucher` (forces `counts_toward_household = false`, recorded in history)
- [X] T094 [P] [US7] Add a "Titre-restaurant" switch to the 003 income screen `mobile/src/app/(app)/budgets/[budgetId]/months/[monthStart]/income.tsx` (turning it on turns off and disables "Compte dans le budget du foyer")
- [X] T095 [US7] Implement `mobile/src/features/tracking/voucher-card.tsx` (per member: income, spent, remaining; negative with icon + text and a hint to add the income line when there is none) on the tracking screen; in the quick-add sheet, choosing "Titre-restaurant" forces a member payer

**Checkpoint**: Swile spending visible against its own income

---

## Phase 10: User Story 8 - Recurring transactions (Priority: P3)

**Goal**: Rules create one transaction per month automatically, linked to the recurring line.

**Independent Test**: quickstart scenario 12.

### Tests for User Story 8

- [X] T096 [P] [US8] Write `backend/test/tracking/us8-recurring.e2e-spec.ts`: CRUD on `/v1/budgets/:b/recurring-transactions` (`dayOfMonth` 1–31, `seriesId` must be a Personal or Recurring shared series of the budget, personal series only for its owner → 403, `expectedVersion`); running the job twice for the same day creates exactly one transaction (origin `recurring`, planned, linked to the line of that series in the month, history cause `recurring`); day 31 in a 30-day month → 30th; rule whose line is missing → unassigned + `needsReview`; Closed month → no transaction, one `recurring_skip`, one push without label/amount; creating the month later via `POST /months` materializes missed occurrences; pausing/editing affects only future occurrences
- [X] T097 [P] [US8] Write `backend/src/tracking/infrastructure/jobs/recurring.job.spec.ts`: selects budgets whose local time (`time_zone`) is in the 06:00 hour, runs under an advisory lock, swallows and logs errors without amounts or labels

### Implementation for User Story 8

- [X] T098 [US8] Implement `backend/src/tracking/application/use-cases/recurring-rules.ts` (create/patch/pause/delete, `nextOccurrence` via `occurrenceDate`, history entity `recurring_rule` in the current month) and `backend/src/tracking/presentation/http/recurring.controller.ts`
- [X] T099 [US8] Implement `backend/src/tracking/application/use-cases/materialize-recurring.ts` (for a month: `dueOccurrences` per active rule, insert with `ON CONFLICT (recurring_rule_id, scheduled_date) DO NOTHING`, resolve line by `series_id`, skip + `recurring_skip` + push on Closed) and bind it as the `RecurringOccurrences` port (T040)
- [X] T100 [US8] Implement `backend/src/tracking/infrastructure/jobs/recurring.job.ts` (`@Cron('5 * * * *')`, new `LOCK_KEYS.materializeRecurring`, per-budget local-time window) until T096–T097 pass
- [X] T101 [P] [US8] Implement `mobile/src/app/(app)/budgets/[budgetId]/recurring/index.tsx` (list with next occurrence, pause switch) and `recurring/edit.tsx` (label, keypad amount, day picker 1–31 with "dernier jour si le mois est plus court" hint, payer, method, recurring line picker), registered in the budget `_layout.tsx` and linked from budget settings; "récurrente" badge on transaction rows

**Checkpoint**: Fixed costs tracked without tapping

---

## Phase 11: User Story 9 - Import a bank CSV export (Priority: P3)

**Goal**: Device-side CSV parsing, mapping remembered, duplicates flagged, review before commit.

**Independent Test**: quickstart scenario 13.

### Tests for User Story 9

- [X] T102 [P] [US9] Add anonymized CSV fixtures to `packages/shared/test/fixtures/csv/` (at least: `;` + Windows-1252 + debit/credit columns, `,` + UTF-8 BOM + signed amount, quoted labels containing `;` and newlines, CRLF) and write `packages/shared/test/csv/csv.spec.ts`: `decodeText` (UTF-8 with/without BOM, Windows-1252 fallback for `é`, `€`), `parseCsv` (delimiter detection, quotes, escaped quotes, CRLF, trailing empty line), `proposeCsvMapping` (keywords `date`, `date opération`, `libellé`, `montant`, `débit`, `crédit`), `rowsFromCsv(mapping)` (dates `DD/MM/YYYY` and `YYYY-MM-DD`, amounts via `parseAmount`, debit → negative expense amount convention, unreadable rows flagged), `headerFingerprint` stable
- [X] T103 [P] [US9] Write `backend/test/tracking/us9-import.e2e-spec.ts`: `GET`/`PUT /v1/budgets/:b/csv-mappings/:fingerprint`; `POST …/transaction-imports` dry-run flags `duplicateOf` (±3 days, same amount and payer), `alreadyImported` by `importKey`, `monthStatus` open/closed/missing, saves nothing; commit creates all included rows atomically (one failure → nothing saved), origin `import`, cause `import`; `closedMonthAction` `skip`/`move_to_current`/`reopen` (reopen by a Member → 403); > 1 000 rows → 400; re-importing the same rows → all `alreadyImported`
- [X] T104 [P] [US9] Write `mobile/src/features/tracking/csv/review.test.tsx`: debits checked, credits unchecked and labelled "Remboursement ?", duplicates unchecked next to the existing transaction, unreadable rows block confirm until fixed or skipped, cancel saves nothing

### Implementation for User Story 9

- [X] T105 [P] [US9] Implement `packages/shared/src/domain/csv/{decode,parse,mapping,rows}.ts` (no dependency, ≈ 80-line RFC 4180 parser, Windows-1252 table) until T102 passes
- [X] T106 [US9] Implement `backend/src/tracking/application/use-cases/csv-mappings.ts` + `import-transactions.ts` (dry-run and commit in one transaction, `findDuplicates` against existing month transactions, `importKey` unique constraint, closed-month action) and `backend/src/tracking/presentation/http/imports.controller.ts` until T103 passes
- [X] T107 [US9] Implement `mobile/src/features/tracking/csv/read-csv.ts` (`expo-document-picker` with `text/csv`/`text/comma-separated-values`, `expo-file-system` read as base64 → bytes → `decodeText`; the raw file never leaves the device) and `mobile/src/app/(app)/budgets/[budgetId]/transactions/import/index.tsx` (account choice joint/personal, mapping step shown when no stored mapping, saves the mapping)
- [X] T108 [US9] Implement `mobile/src/app/(app)/budgets/[budgetId]/transactions/import/review.tsx` (rows with date, label, amount, suggested line via `stripBankNoise` + `suggestLine`, planned toggle, include checkbox; dry-run on open; closed-month batch choice; confirm → commit; haptic) until T104 passes; register routes and link from the transaction list menu

**Checkpoint**: All user stories functional

---

## Phase 12: Polish & Cross-Cutting Concerns

- [X] T109 [P] Extend the GDPR export (`backend/src/identity/application/use-cases/export-data.ts` + `zip-export-builder.ts`) with the caller's budgets' transactions, parts, settlements, recurring rules and receipt photos as zip entries; extend `backend/test/export-deletion.e2e-spec.ts` (Principle III, R15)
- [X] T110 [P] Extend `backend/test/planning/logging.e2e-spec.ts` (or add `backend/test/tracking/logging.e2e-spec.ts`): no amount, label, note or receipt bytes appear in logs or push payloads for every tracking route and the recurring job (FR-050)
- [X] T111 [P] Write `backend/test/tracking/performance.e2e-spec.ts`: `GET tracking` with 80 lines × 300 transactions × 6 members p95 < 300 ms; 304 path < 50 ms server time
- [X] T112 [P] Write `backend/test/tracking/us-line-deletion.e2e-spec.ts`: deleting a line with 2 transactions (003 `Lines.remove`) leaves both transactions with an unassigned part and `needsReview`; deleting a sub-item clears it on parts (FR-045)
- [X] T113 Add a timed quick-add test `mobile/src/features/tracking/quick-add-timing.test.tsx` (sheet mount < 300 ms with cached hints, save handler resolves without awaiting the network) and record the manual SC-001 usability protocol (5 participants × 10 transactions, median) in `specs/004-transaction-tracking/quickstart.md`
- [ ] T114 Accessibility and appearance pass on quick add, keypad, chips, tracking, envelope, balance, voucher, list, CSV review: light/dark, largest font scale, VoiceOver and TalkBack, 44 pt targets, icon + text for every warning/over/pending state (constitution workflow gate)
- [ ] T115 Run the full quickstart (`specs/004-transaction-tracking/quickstart.md`) on iOS and Android, then `pnpm lint && pnpm typecheck && pnpm test` and `pnpm --filter two-cents-backend test:e2e`; fix what fails

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none
- **Foundational (Phase 2)**: after Setup — blocks every story
- **US1 (Phase 3)**: after Foundational
- **US2 (Phase 4)**: after Foundational; uses transactions created by US1 in its tests (can seed via repository in e2e)
- **US3 (Phase 5)**: after US1 (needs the create mutation and quick-add sheet)
- **US4 (Phase 6)**: after US1 (chips + sheet)
- **US5 (Phase 7)**: after US1; receipts upload (T086) after T058
- **US6 (Phase 8)**: after US2 (balances shown in tracking)
- **US7 (Phase 9)**: after US2 (vouchers shown in tracking)
- **US8 (Phase 10)**: after Foundational (T040 port); UI independent
- **US9 (Phase 11)**: after US4 (suggestions reused on bank labels)
- **Polish (Phase 12)**: after the stories it touches

### Story graph

```text
Setup → Foundational ─┬─ US1 ─┬─ US3
                      │       ├─ US4 ── US9
                      │       └─ US5
                      ├─ US2 ─┬─ US6
                      │       └─ US7
                      └─ US8
```

### Within Each User Story

- Tests first, seen failing
- Backend use case → controller → mobile hooks → screens
- Story checkpoint before moving on

## Parallel Opportunities

- Phase 1: T001–T003 all [P]
- Phase 2: domain tests T004–T013 in parallel; then implementations T014–T022 in parallel; contracts T025–T027 in parallel; mobile plumbing T041–T043 in parallel with backend skeleton
- US1: T045–T049 tests in parallel; T053/T054 in parallel with backend T050–T052
- After Foundational, US2 and US8 can proceed in parallel with US1 (different files), and US6/US7 in parallel once US2 lands

### Parallel Example: Phase 2 domain

```text
Task: "T005 Write actuals.spec.ts"
Task: "T006 Write envelope.spec.ts"
Task: "T007 Write balances.spec.ts"
Task: "T009 Write suggest.spec.ts"
→ then T016, T017, T018, T020 in parallel
```

### Parallel Example: User Story 1

```text
Task: "T045 us1-record.e2e-spec.ts"
Task: "T046 privacy.e2e-spec.ts"
Task: "T048 amount-keypad.test.tsx"
Task: "T049 quick-add.test.tsx"
→ backend T050–T052 alongside mobile T053–T054
```

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 + Phase 2 (domain green incl. property test)
2. US1: record online, quickly
3. US2: planned vs actual + envelopes → **demo**: the spreadsheet's empty envelope tables, filled
4. US3 before release to real users (shops have poor signal)

### Incremental Delivery

1. MVP (US1–US2) → US3 → release candidate (all P1)
2. US4 + US5 → faster recording, fixable mistakes
3. US6 → rebalancing
4. US7, US8, US9 → vouchers, recurring, CSV catch-up

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Commit per task or logical group with Conventional Commits and the issue reference, e.g. `feat(mobile): add quick expense sheet [#12]`
- Stop at each checkpoint to validate the story on its own
