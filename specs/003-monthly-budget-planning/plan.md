# Implementation Plan: Monthly Budget Planning

**Branch**: `003-monthly-budget-planning` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-monthly-budget-planning/spec.md`

## Summary

Each budget gets **months** (Draft → Active → Closed) holding **income lines** per member and
**budget lines** in three groups (DI, DCR, DCE), each with per-member **shares** that always add
up to the line total. All figures (DI/DCR/DCE, what's left, transfer, savings rate, household
totals) come from one pure, test-first calculation module in `@two-cents/shared/domain/planning`,
used by the backend (source of truth) and by the app for the live summary. Property-based
tests check it against an independent oracle on ≥ 1 000 random months (SC-002).

New months are copied from a source month or a template with recurring lines only; a
`series_id` plus a `usual` snapshot implements "from this month on" (propagated to later
Draft months not edited by hand) vs "this month only". Private personal lines are redacted on
the server and replaced by per-member aggregates. Every write locks the month row, bumps a
**revision**, writes a **change record**, and uses per-line versions for conflicts. Other
members see edits through 2 s conditional polling on the revision (ETag/304), within the 5 s
target with no new infrastructure. Spreadsheets (.xlsx/.ods) are parsed **on the device**
with SheetJS and committed through a dry-run/commit import endpoint.

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node 24.9+ (backend), Hermes / React Native 0.88 (Expo SDK 58)

**Primary Dependencies**: Existing: NestJS 12, Drizzle ORM, Zod 4, TanStack Query 5, Expo Router, i18next. **New**: `fast-check` (dev, `packages/shared`, R3); SheetJS CE `xlsx@0.20.3` from the official tarball (mobile, R16); `expo-document-picker` and `expo-network` (Expo SDK modules, R16/R17)

**Storage**: PostgreSQL 18; 8 new tables (`budget_month`, `budget_category`, `budget_line`, `budget_line_share`, `envelope_sub_item`, `income_line`, `month_change`, `month_template`); `member_income` migrated and dropped

**Testing**: Jest + fast-check (shared domain, test-first), Jest unit with in-memory fakes (use cases), Jest + Supertest on real Postgres (e2e, authz matrix, privacy leak test), React Native Testing Library (amount field, summary, conflict dialog, import preview)

**Target Platform**: iOS 17+ and Android 10+ (development build); Linux container for the API

**Project Type**: Mobile app + API with a shared TypeScript package

**Performance Goals**: Other member sees an edit in < 5 s (p95, SC-004) via 2 s polling; `GET month` p95 < 300 ms with 80 lines × 6 members; 304 path < 50 ms server time; live summary recomputed on device in < 16 ms per keystroke

**Constraints**: Money as bigint minor units end to end (signed only for "what's left"); shares = total enforced in domain and by a deferred DB trigger; private lines never serialized to other members; no amounts or labels in logs/analytics/push; raw spreadsheets never leave the device

**Scale/Scope**: 2–6 contributing members, ≤ 80 lines per month, ~12 months/year per budget; ≈ 25 endpoints; ≈ 10 screens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Money is exact | ✅ | bigint minor units everywhere, integer-string wire format, `SignedAmountMinor` for what's left; rounding rules (largest remainder, formula half-up) written in shared domain and unit-tested incl. remainder cents; `parseAmount` for all inputs incl. import (`"12,5"` text); DB checks + deferred Σ shares trigger; `month_change` records who/what/when |
| II | Calculations tested first | ✅ | `planning/` module (splits, formulas, summary, copy, propagation rule) written test-first; backend and app call the same functions; property tests vs independent oracle; Novembre 2026 + both spreadsheet bugs as regression fixtures |
| III | Privacy by default | ✅ | All routes behind `BudgetAccessGuard` + added to the route-coverage test; private lines redacted server-side with a JSON leak test; spreadsheet parsed on device; no amounts/labels in logs; history stored in DB only |
| IV | Mobile-first, native | ✅ | Native stacks + form sheets + action sheet for scope; haptics on save/activate/close; quick-expense flow untouched (month screen is a separate stack) |
| V | One design system | ✅ | Single `AmountField` + existing amount component; overrun badge as a shared component; tokens only |
| VI | French first | ✅ | Month labels, history sentences, category defaults and errors via i18n keys; `Intl` for dates/amounts |
| VII | Contract-first API | ✅ | New Zod modules in `@two-cents/shared/contracts`; 002 income route kept for old app versions (R13); `actuals` field reserved for feature 04 |
| VIII | Accessible | ✅ | Overrun = icon + "Dépassement" text; reorder via buttons, not drag only; 44 pt targets; checked at largest font with 6 members |
| IX | AI optional | N/A | No AI (import heuristics are deterministic rules) |
| X | Simplicity | ✅ (justified) | Polling instead of a realtime stack; templates as jsonb; reorder without a drag library; each new dependency justified in research (R3, R16, R17); no feature flags |

**Gate result: PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/003-monthly-budget-planning/
├── plan.md              # this file
├── research.md          # Phase 0 (R1–R19)
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
│   │   ├── months.ts, lines.ts, incomes.ts (extended), categories.ts, templates.ts, imports.ts   # NEW
│   │   └── budgets.ts                     # + SignedAmountMinor
│   └── domain/
│       ├── permissions.ts                 # + months.create/activate/close/reopen
│       ├── planning/                      # NEW, test-first
│       │   ├── split.ts                   # splitByWeights, computeShares
│       │   ├── formula.ts                 # monthlyFromFormula
│       │   ├── summary.ts                 # computeMonthSummary, savingsRatePermille
│       │   ├── month-status.ts            # transitionMonth
│       │   ├── copy.ts                    # copyLinesForNewMonth
│       │   ├── recurring.ts               # shouldPropagate
│       │   ├── label.ts                   # monthLabelFor
│       │   └── sub-items.ts               # validateSubItems
│       └── import/                        # NEW: periodFromSheetName, proposeSheetMapping
└── test/
    ├── planning/*.spec.ts
    ├── planning/summary.property.spec.ts  # fast-check vs oracle (SC-002)
    ├── fixtures/novembre-2026.ts
    └── import/*.spec.ts

backend/
├── drizzle/0004_monthly_planning.sql      # tables, checks, deferred trigger, category seed, member_income migration
└── src/
    ├── shared-kernel/infrastructure/db/schema/planning.ts   # NEW
    ├── budgets/                           # 002: income use case + MemberView rewired to income_line;
    │                                      #      membership use cases call MonthMembershipSync port
    └── planning/                          # NEW module, same clean-architecture layout as budgets/
        ├── domain/
        │   ├── entities/                  # budget-month, budget-line, income-line, month-template, category
        │   └── ports/                     # MonthRepository, LineRepository, IncomeLineRepository, ChangeLog, TemplateRepository, CategoryRepository
        ├── application/
        │   ├── ports/                     # ActualsProvider (null impl until 04), MonthMembershipSync
        │   ├── services/                  # month-detail-view (redaction R10), month-writer (lock + revision + change log)
        │   └── use-cases/                 # create-month, change-status, create/update/delete/reorder-line,
        │                                  # income-lines, categories, templates, import, propagate-recurring, recompute-proportional
        ├── infrastructure/persistence/    # drizzle repositories + mappers
        ├── presentation/http/             # months, lines, incomes, categories, templates, imports controllers (ETag on GET month)
        └── planning.module.ts
    test/
        ├── authz/route-coverage.e2e-spec.ts   # extended with every new route
        └── planning/*.e2e-spec.ts             # incl. privacy-leak and concurrency specs

mobile/src/
├── app/(app)/budgets/[budgetId]/months/
│   ├── index.tsx                          # month list (US7)
│   ├── new.tsx                            # creation sheet (US2)
│   ├── templates.tsx, categories.tsx
│   ├── import/{index,preview}.tsx         # US8
│   └── [monthStart]/{index,line,income,history}.tsx
├── features/planning/
│   ├── api.ts, query-keys.ts              # useMonth (2 s ETag polling, R4), mutations returning MonthDetail
│   ├── use-live-summary.ts                # computeMonthSummary on draft edits
│   ├── amount-field.tsx                   # parseAmount + inline errors
│   ├── summary-header.tsx, overrun-badge.tsx, line-row.tsx, conflict-dialog.tsx
│   ├── scope-sheet.ts                     # "À partir de ce mois / Ce mois-ci uniquement"
│   ├── import/read-workbook.ts            # SheetJS, on device
│   └── online.ts                          # expo-network → onlineManager
└── i18n/{fr,en}.json                      # + planning keys
```

**Structure Decision**: Same mobile + API + `packages/shared` layout as 001/002. Planning gets
its own backend module (`backend/src/planning`) rather than growing `budgets/`, because it has
its own aggregate (the month) and its own lifecycle; it depends on `budgets/` only through
`BudgetAccess` and membership queries.

## Implementation order (for /speckit-tasks)

1. Shared domain test-first: split, formula, summary (+ property tests, Novembre fixture,
   regression for both spreadsheet bugs), month status, label; permissions; contracts
2. Migration 0004 + Drizzle schema (incl. deferred trigger, category seed, `member_income` →
   `income_line`); rewire the 002 income route and `MemberView`
3. **US1** (P1): months (scratch), incomes, lines with custom split, `GET month` + ETag polling,
   live summary screen, conflicts, authz + privacy tests from the first route
4. **US2** (P1): create from previous/month/template/scratch, copy rules, incomes to confirm,
   templates
5. **US3**: equal/proportional/one-payer splits, formulas, recompute on income change, sub-items, categories
6. **US4**: personal-line ownership, private lines, redaction + leak test
7. **US5**: status transitions, change history screen, close snapshot, reopen, `actuals` stub
8. **US6**: scope choice, `usual`, propagation to later Draft months
9. **US7**: month list, duplicate with one-off option
10. **US8**: import heuristics (shared), device parsing, preview, dry-run/commit endpoint
11. `MonthMembershipSync` (join/leave recompute, needs-review), offline banner, accessibility pass

## Post-Design Constitution Re-check

Re-checked against data-model.md and contracts/rest-api.md:

- I: no `number` money fields in contracts (only `savingsRatePermille` and `factor`, which are not money) ✅; Σ shares enforced twice ✅; every mutation writes `month_change` ✅
- II: summary in `MonthDetail` is computed by the same `computeMonthSummary` the app runs ✅
- III: `privateAggregates` + redacted `ChangeView` + templates drop others' private lines ✅; import body is structured data only ✅
- VII: 002 route kept and documented; `actuals: null` reserved ✅
- X: no realtime server, no queue, no drag library ✅

**Result: PASS.**

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| New `planning` backend module | The month is its own aggregate with lifecycle, history and concurrency rules | Growing `budgets/` would mix membership and planning rules in one module |
| Deferred Σ shares trigger in addition to the domain check | Principle I: a one-cent drift destroys trust; protects against any future write path | Domain check alone leaves the import and propagation paths unprotected by the DB |
| SheetJS from a tarball URL instead of the npm registry | The registry version (0.18.5) is unmaintained with known CVEs; only 0.20.x reads `.ods` and `.xlsx` safely | `exceljs` has no `.ods` support (clarification Q2) |
