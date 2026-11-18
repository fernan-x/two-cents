# Implementation Plan: Transaction Tracking

**Branch**: `004-transaction-tracking` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-transaction-tracking/spec.md`

## Summary

Members record what they actually spend as **transactions** attached to a budget month, split
over one or more **parts** (one per budget line, none when unassigned). A persistent "+"
opens a quick-add sheet with an in-app amount keypad, label, and line chips (6 most used +
a suggestion learned from past labels), saved optimistically. Recording works **offline**:
client-generated ids, an idempotent `PUT`, and TanStack Query persisted mutations resumed on
reconnect. All derived figures (actual per line/group/month, "not tracked", envelope
progress and warnings, balances between members using each line's planned split, meal-voucher
remaining) come from a new pure, test-first module `@two-cents/shared/domain/tracking`, used
by the backend (source of truth) and the app (offline/optimistic figures), with property tests
against an independent oracle. Partners see changes through the 003 revision + ETag polling.
Recurring rules are materialized by a scheduled job and by month creation, exactly once.
Bank CSV exports are parsed on the device and committed through a dry-run/commit endpoint with
duplicate detection. Receipt photos are resized on device and stored in Postgres.

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node 24.9+ (backend), Hermes / React Native 0.88 (Expo SDK 58)

**Primary Dependencies**: Existing: NestJS 12, `@nestjs/schedule`, Drizzle ORM, Zod 4, TanStack Query 5, Expo Router, i18next, fast-check (dev), `expo-network`, `expo-haptics`, `expo-document-picker`, `expo-file-system`. **New** (mobile only, research R16): `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `expo-sqlite` (kv-store), `expo-image-picker`, `expo-image-manipulator`

**Storage**: PostgreSQL 18; migration `0007_transactions.sql`: 8 new tables (`txn`, `txn_part`, `txn_receipt`, `settlement`, `recurring_txn_rule`, `recurring_skip`, `bank_csv_mapping`, `suggestion_stat`), `income_line.is_meal_voucher`, enum extensions on `month_change`. On device: persisted query cache + paused mutations in `expo-sqlite/kv-store`

**Testing**: Jest + fast-check (shared `tracking/` and `csv/`, test-first, SC-005), Jest unit with in-memory fakes (use cases), Jest + Supertest on real Postgres (e2e: authz matrix, privacy leak, idempotent PUT replay, concurrency, recurring job exactly-once, import all-or-nothing), React Native Testing Library (keypad, quick add, offline queue, envelope card, balance card, CSV review)

**Target Platform**: iOS 17+ and Android 10+ (development build); Linux container for the API

**Project Type**: Mobile app + API with a shared TypeScript package

**Performance Goals**: Quick-add sheet open < 300 ms and save < 100 ms on device (no network wait); median record time < 10 s (SC-001); partner sees a change < 5 s p95 (SC-006, 2 s polling); `GET tracking` p95 < 300 ms with 80 lines × 300 transactions × 6 members; 304 path < 50 ms server time

**Constraints**: Money as bigint minor units end to end, signed for actuals/refunds/balances; Σ parts = amount enforced in domain and by a deferred DB trigger; exactly-once creation for retries (offline) and recurring occurrences; private-line transactions never serialized to others; raw CSV files never leave the device; no amounts/labels in logs, analytics or push

**Scale/Scope**: 2–6 members, ≤ 300 transactions/month, ≤ 3 receipts per transaction; ≈ 20 new endpoints; ≈ 9 screens/sheets

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Money is exact | ✅ | bigint minor units, `SignedAmountMinor` on the wire; `parseAmount` in keypad, CSV and API; balance rounding reuses 003 largest-remainder `splitByWeights` with sign restore, unit-tested incl. remainder cents; Σ parts trigger; every write recorded in `month_change`; settlements immutable (reversal only) |
| II | Calculations tested first | ✅ | `tracking/` (actuals, not-tracked totals, envelope thresholds, balances, vouchers, suggestions, duplicates, occurrence dates) and `csv/` written test-first; backend and app call the same functions; fast-check property tests vs independent oracle (SC-005); regression fixtures for the quickstart figures (26,12 €, 82,5 %, +20,00 €) |
| III | Privacy by default | ✅ | All routes behind `BudgetAccessGuard` + route-coverage test; private-line transactions redacted server-side incl. hints and receipts, JSON leak e2e test; CSV parsed on device; receipts EXIF-stripped, readable only by budget members, in GDPR export, cascade-deleted; `suggestion_stat` holds counts only; push for skipped recurring has no amount/label; persisted device cache cleared on sign-out |
| IV | Mobile-first, native | ✅ | **10 s budget kept** by: persistent "+", in-app keypad (no keyboard delay), line chips + suggestion preselected, all other fields defaulted, optimistic save without network wait, offline queue (R12); form sheets, haptics on save/settle/paid-as-planned |
| V | One design system | ✅ | Keypad, envelope progress, balance card built from tokens and shared components; all amounts via the existing amount component; one `AmountField`/keypad parse path |
| VI | French first | ✅ | All labels (payment methods, "Non suivi", "Dépassement", "Payé comme prévu", balance sentence) via i18n keys; dates and amounts via `Intl`; CSV accepts French formats |
| VII | Contract-first API | ✅ | New Zod modules in `@two-cents/shared/contracts`; additive changes to 003 contracts only; `MonthDetail.actuals` kept `null` (deprecated) because filling it with signed values would break 003 builds (R5) |
| VIII | Accessible | ✅ | Keypad keys 64 pt with labels; warning/over shown by icon + text; progress bars expose value text; filters and chips reachable by screen reader; split editor uses buttons, not gestures |
| IX | AI optional | N/A | No AI: suggestions are counting rules over the household's own history (FR-013a) |
| X | Simplicity | ✅ (justified) | Reuses polling, versions, history, splits; balances computed not stored; no sync engine, no object storage, no CSV library; each new mobile dependency justified (R16); no feature flags |

**Gate result: PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/004-transaction-tracking/
├── plan.md              # this file
├── research.md          # Phase 0 (R1–R16)
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── rest-api.md      # Phase 1
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
packages/shared/
├── src/
│   ├── contracts/
│   │   ├── transactions.ts, tracking.ts, settlements.ts, recurring.ts,
│   │   │   transaction-imports.ts, transaction-hints.ts               # NEW
│   │   ├── income.ts                                                  # + isMealVoucher
│   │   └── months.ts                                                  # actuals deprecated; ChangeView enums extended
│   └── domain/
│       ├── permissions.ts                 # + transactions.read / transactions.write
│       ├── tracking/                      # NEW, test-first
│       │   ├── actuals.ts                 # lineActuals, computeTracking
│       │   ├── envelope.ts                # envelopeState
│       │   ├── balances.ts                # computeBalances (uses planning/split)
│       │   ├── vouchers.ts                # voucherRemaining
│       │   ├── payment.ts                 # validatePayment, defaultPlanned, validateParts
│       │   ├── suggest.ts                 # normalizeLabel, stripBankNoise, suggestLine, mostUsedLines
│       │   ├── duplicates.ts              # findDuplicates
│       │   └── recurring.ts               # occurrenceDate
│       └── csv/                           # NEW: decodeText, parseCsv, proposeCsvMapping, rowsFromCsv
└── test/
    ├── tracking/*.spec.ts
    ├── tracking/tracking.property.spec.ts # fast-check vs oracle (SC-005)
    ├── csv/*.spec.ts + fixtures/csv/*     # anonymized French bank exports
    └── fixtures/novembre-2026-actuals.ts

backend/
├── drizzle/0007_transactions.sql          # tables, checks, deferred Σ parts trigger, enum extensions
└── src/
    ├── shared-kernel/infrastructure/db/schema/tracking.ts       # NEW
    ├── planning/                          # 003: remove ActualsProvider; delete-line and create-month
    │                                      #      call TransactionsForLine / RecurringOccurrences ports;
    │                                      #      income lines gain isMealVoucher
    └── tracking/                          # NEW module, same clean-architecture layout
        ├── domain/{entities,ports}/       # transaction, settlement, recurring-rule, csv-mapping
        ├── application/
        │   ├── services/                  # tracking-view (redaction), txn-writer (month lock + revision + change log)
        │   └── use-cases/                 # put/patch/delete transaction, paid-as-planned, receipts,
        │                                  # settlements, hints, recurring rules + materialize, import, csv mappings
        ├── infrastructure/
        │   ├── persistence/               # drizzle repositories + mappers
        │   └── jobs/recurring.job.ts      # hourly cron, per-budget 06:00 local, advisory lock
        ├── presentation/http/             # transactions, tracking, settlements, hints, recurring, imports, receipts controllers
        └── tracking.module.ts
    test/
        ├── authz/route-coverage.e2e-spec.ts   # extended with every new route
        └── tracking/*.e2e-spec.ts             # idempotency, privacy leak, concurrency, recurring, import

mobile/src/
├── app/(app)/budgets/[budgetId]/
│   ├── _layout.tsx                        # + floating "+" (QuickAddButton), new screens
│   ├── transactions/new.tsx               # quick-add sheet (US1)
│   ├── transactions/[txnId].tsx           # detail / edit / delete (US5)
│   ├── transactions/import/{index,review}.tsx   # CSV (US9)
│   ├── recurring/{index,edit}.tsx         # US8
│   └── months/[monthStart]/
│       ├── transactions.tsx               # list + filters (US5)
│       ├── tracking.tsx                   # planned vs actual, envelopes, balances, vouchers (US2, US6, US7)
│       └── envelope/[lineId].tsx          # envelope detail
├── features/tracking/
│   ├── api.ts, query-keys.ts, mutations.ts   # setMutationDefaults + scope per txn (R3)
│   ├── persist.ts                         # persister on expo-sqlite/kv-store, cleared on sign-out
│   ├── use-offline-tracking.ts            # computeTracking over cache + pending mutations
│   ├── amount-keypad.tsx, line-chips.tsx, quick-add-button.tsx
│   ├── envelope-card.tsx, balance-card.tsx, sync-badge.tsx, closed-month-dialog.tsx
│   ├── receipts.ts                        # pick/resize/upload
│   └── csv/read-csv.ts                    # file → decodeText → parseCsv (on device)
└── i18n/{fr,en}.json                      # + tracking keys
```

**Structure Decision**: Same mobile + API + `packages/shared` layout as 001–003. Transactions
get their own backend module (`backend/src/tracking`) depending on `planning/` only through
read ports (month by period, lines and shares of a month, month lock/writer) and exposing two
ports back to planning (`TransactionsForLine`, `RecurringOccurrences`), so the month
aggregate stays in `planning/`.

## Implementation order (for /speckit-tasks)

1. Shared domain test-first: `payment`, `actuals`, `envelope`, `balances`, `vouchers`,
   property tests + fixtures; contracts; permissions
2. Migration 0007 + Drizzle schema (Σ parts trigger, checks, enum extensions,
   `is_meal_voucher`); remove `ActualsProvider`
3. **US1** (P1): `PUT`/`GET` transactions, txn-writer (lock, revision, history), quick-add
   sheet with keypad + most-used chips, "+" button, authz + privacy tests from the first route
4. **US2** (P1): `GET tracking`, paid-as-planned, tracking screen, envelope card/detail
5. **US3** (P1): persisted mutations, scopes, offline tracking, sync badge, closed-month and
   conflict dialogs, idempotency e2e
6. **US4**: hints endpoint, `suggest.ts`, preselection, `suggestion_stat`
7. **US5**: list + device-side filters/search, detail, `PATCH`/`DELETE`, undo, receipts
8. **US6**: shared flag for unassigned, balances in tracking, settlements, balance card
9. **US7**: `isMealVoucher` on incomes, voucher remaining, payment rules
10. **US8**: recurring rules CRUD, job + create-month port, skip notification
11. **US9**: `csv/` domain, mapping store, review screen, dry-run/commit import
12. Line-deletion port (unassign), GDPR export additions, accessibility pass, SC-001 timing test

## Post-Design Constitution Re-check

Re-checked against data-model.md and contracts/rest-api.md:

- I: no `number` money fields in contracts (only `permille`, counts, `dayOfMonth`) ✅;
  Σ parts enforced twice ✅; every mutation (txn, receipt, settlement, rule) writes
  `month_change` ✅; settlements immutable ✅
- II: `TrackingView` produced by the same shared functions the app runs offline ✅
- III: private `TransactionView` variant has no label/amount; hints exclude private; receipt
  GET hidden for private; leak test covers list, tracking, hints, receipts ✅
- IV: quick add needs 3 inputs + save, no network wait ✅
- VII: 003 changes additive; `actuals` kept null; `ChangeView` enum extension checked against
  003 clients (contract note) ✅
- X: no realtime server, no object storage, no sync engine, no CSV library ✅

**Result: PASS.**

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| New `tracking` backend module | Transactions have their own lifecycle, offline idempotency, jobs and import | Growing `planning/` would mix the plan aggregate with high-volume actuals |
| Persisted mutations + 2 TanStack packages + `expo-sqlite` | Offline recording that survives restarts (US3, SC-004) | Online-only fails in shops; hand-written outbox re-implements TanStack's queue |
| Receipt bytes in Postgres | Photos needed (FR-001) without new infrastructure | Object storage adds a service, credentials and signed URLs; kept swappable behind `ReceiptStore` |
| Deferred Σ parts trigger in addition to the domain check | Principle I; protects import, recurring and paid-as-planned paths | Domain check alone leaves non-UI write paths unguarded |
