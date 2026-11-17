---

description: "Task list for 003-monthly-budget-planning"
---

# Tasks: Monthly Budget Planning

**Input**: Design documents from `/specs/003-monthly-budget-planning/`: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/rest-api.md](./contracts/rest-api.md), [quickstart.md](./quickstart.md)

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. The spec requires property-based tests (SC-002) and exact example figures (SC-003). The constitution requires domain functions written test-first (Principle II) and a non-member refusal test for every budget route (Principle III). Write each test task first and confirm it fails before implementing.

**Organization**: Tasks are grouped by user story (US1–US8 from spec.md) so each story can be implemented and tested on its own.

**Starting point**: 001 and 002 are implemented. Reused as-is, **not** rebuilt: pnpm workspace, Drizzle (`backend/drizzle.config.ts`, migrations in `backend/drizzle/`, `db:migrate`), `packages/shared` (`parseAmount`/`minorDigits` in `packages/shared/src/domain/money.ts`, `budgetMonthFor` in `budget-month.ts`, `isIncludedInMonth` in `membership.ts`, `can` in `permissions.ts`, `AmountMinor`/`Money`/`PersonRef`/`LocalDate` in `contracts/budgets.ts`), `TransactionRunner`, `Clock`, `IdGenerator` (UUID v7), `DomainError` + `backend/src/shared-kernel/presentation/http-status.ts` (error code → status map), `ZodValidationPipe`, `BudgetAccess` service (`backend/src/budgets/application/services/budget-access.ts`, `require(budgetId, userId, permission, { forUpdate })`), `BudgetAccessGuard` + `@RequirePermission`, the authz route-coverage suite (`backend/test/authz/route-coverage.e2e-spec.ts` reading `backend/test/authz/budget-route-cases.ts`), e2e helpers in `backend/test/support/`, TanStack Query, i18next (`mobile/src/i18n/{fr,en}.json`), `formatMoney` in `mobile/src/features/budgets/format.ts`, `Card`/`SectionTitle`/`ChoiceRow` in `mobile/src/features/budgets/components.tsx`, `expo-haptics`.

## Implementation notes (deviations from the plan)

- **T029, two migrations instead of one.** `drizzle-kit generate` asks an interactive rename question, so the work is split: `backend/drizzle/0004_monthly_planning.sql` (tables, deferred Σ shares trigger, category seed for existing budgets) and `0005_migrate_member_income.sql` (copy into `income_line`, drop `member_income`).
- **T079, categories seeded by a trigger.** A database trigger seeds the default categories for new budgets (`0006_seed_budget_categories.sql`), instead of a `CategorySeeder` port. This keeps 002's `CreateBudget` independent of planning.
- **T031, legacy income route.** `PUT …/members/me/income/:monthStart` now calls planning's `UpsertPrimaryIncome`, and `RecordIncome` is deleted. `BudgetsModule` imports `PlanningCoreModule`; `BudgetsCoreModule` additionally exports `BUDGET_REPOSITORY` and `MEMBERSHIP_REPOSITORY`.
- **T115, join hook.** `AcceptInvitation` calls the new `MembershipHooks` service (budgets core), and the planning module registers `MonthMembershipSync` with it at startup. Departures need nothing: 002 FR-033 plus the copy rules already cover them. Not done: re-syncing open months when a role changes to or from viewer.
- **T032, plain records.** Templates and categories are plain records in the ports (no entity classes). Their rules live in the use cases.
- **Running tests.** Backend and mobile tests need Node 24.9+ (`fnm use 24` or `~/.local/share/fnm/node-versions/v24.22.3`). The e2e suites run through `pnpm test:e2e`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US8)
- Each description gives exact file paths

## Path Conventions

- Shared: `packages/shared/src/domain/planning/*.ts`, `packages/shared/src/domain/import/*.ts`, `packages/shared/src/contracts/*.ts`; tests in `packages/shared/test/planning/`, `packages/shared/test/import/`, fixtures in `packages/shared/test/fixtures/`
- Backend: new module `backend/src/planning/{domain,application,infrastructure,presentation}/` with the same clean-architecture layers and ESLint import rules as `backend/src/budgets/`. Unit tests colocated `*.spec.ts`; e2e in `backend/test/planning/*.e2e-spec.ts`
- Mobile: routes in `mobile/src/app/(app)/budgets/[budgetId]/months/`, feature code in `mobile/src/features/planning/`, tests colocated `*.test.ts(x)`
- Layer rule: `domain/` imports only `@two-cents/shared/domain`; `application/` imports `domain/` plus `@nestjs/common` `Injectable`/`Inject`; `presentation/` calls use cases only
- Mobile rule (`mobile/AGENTS.md`): add Expo packages with `npx expo install`, and read the SDK 58 docs before using any Expo API
- Money: bigint minor units in code, integer strings on the wire, never `number` (Principle I). No amounts or labels in logs (Principle III). Every user-facing string goes through i18n (Principle VI)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New dependencies only (research R3, R16, R17)

- [X] T001 [P] Add `fast-check` (latest 4.x, exact version) as a devDependency of `packages/shared/package.json` and run `pnpm install`; the existing Jest `roots: ["<rootDir>/test"]` already covers `test/planning/` — confirm `pnpm --filter @two-cents/shared test` still passes
- [X] T002 [P] In `mobile/`, run `npx expo install expo-document-picker expo-network` (read the SDK 58 docs for both first)
- [X] T003 [P] Add SheetJS CE to `mobile/package.json` as `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` (research R16: never the npm-registry `xlsx@0.18.5`), run `pnpm install`, and add the same tarball as a devDependency of `packages/shared/package.json` (used only by import test fixtures, T107)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Calculation engine, contracts, schema and migration, the planning module skeleton (month writer, detail view, ETag), the 002 income rewiring, and mobile plumbing. Every story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Fixture and domain tests first (Principle II): write them and see them fail

- [X] T004 Create `packages/shared/test/fixtures/novembre-2026.ts` exporting the Novembre 2026 month as plain data (`members`, `incomes`, `lines`, amounts as **strings typed by a person**, parsed with `parseAmount(…, 'EUR')` in the fixture loader). Members: `maelle` (order 0), `fabien` (order 1). Incomes: Maëlle "Salaire" `2 000,00` counts; Fabien "Salaire" `2 990,00` counts, "Swile" `160,00` does **not** count. Personal: Maëlle — Forfait mobile `15,00`, Spotify **`12,5`**, Psy `60,00`, Salle de sport `29,90`, Livret A `26,92` (savings) → DI 144,32; Fabien — Forfait mobile `19,99`, Assurance vie `300,00` (savings), Escalade `55,00`, Abonnements `14,33`, PEA `200,00` (savings) → DI 589,32. Recurring shared: Loyer 1 900 (custom 950/950), Courses 400 (custom 100/300), Électricité 120 (equal 60/60), Carburant 280 (custom 50/230), Assurance habitation 25,04 (equal 12,52/12,52), Chats 90 (equal), Streaming 30 (equal), Restaurants 200 (equal), Épargne commune 510 (savings, equal) → DCR 1 587,52 / 1 967,52. One-off shared: Cadeaux de Noël 550 (equal) → DCE 275/275. Also export `expected` with every figure listed in T007
- [X] T005 [P] Write `packages/shared/test/planning/split.spec.ts` for `splitByWeights(total: bigint, weights: bigint[]): bigint[]` and `computeShares(input)`. Cases: `splitByWeights(1001n, [1n, 1n])` → `[501n, 500n]` (largest remainder, ties to lower member order); `splitByWeights(1000n, [1n,1n,1n])` → `[334n, 333n, 333n]`; proportional incomes 2 000/3 000 on 500 € → 200/300; weights all 0 → throws `NO_INCOME_FOR_PROPORTIONAL`; shares always sum to total. `computeShares`: `equal`, `proportional` (weights = counted incomes of contributing members), `one_payer` (payer gets all, others `0n`), `custom` with entered shares (total computed when no total given); `custom` total 40000n with shares 10000n + 25000n → throws `SPLIT_MISMATCH` carrying `differenceMinor = 5000n`; a member absent from entered shares counts as `0n`
- [X] T006 [P] Write `packages/shared/test/planning/formula.spec.ts` for `monthlyFromFormula({ kind, baseMinor, factor })`: `per_year` 8000n → 667n; `per_half_year` 10000n → 1667n; `per_quarter` 10000n → 3333n; `times` 4700n × 2 → 9400n; half-up rounding (`per_year` 6n → 1n, 5n → 0n since 5/12 < 0.5; `per_quarter` 15n → 5n, `per_half_year` 3n → 1n since 0.5 rounds up); `factor` must be an integer 1–99 for `times` and is ignored otherwise; result above `MAX_AMOUNT_MINOR` throws `AMOUNT_TOO_LARGE`
- [X] T007 [P] Write `packages/shared/test/planning/summary.spec.ts` for `computeMonthSummary({ members, incomes, lines, privateAggregates })` using the T004 fixture. Expected exactly: Maëlle counted 200000n, other 0n, DI 14432n, DCR 158752n, DCE 27500n, whatsLeft **−684n**, transfer 186252n, savings 28192n, savingsRatePermille 141, overrun true; Fabien counted 299000n, other 16000n, DI 58932n, DCR 196752n, DCE 27500n, whatsLeft 15816n, transfer 224252n, savings 75500n, savingsRatePermille 253, overrun false; household counted 499000n, other 16000n, planned 483868n, whatsLeft 15132n, transfer 410504n, savings 103692n. Also: `savingsRatePermille(x, 0n)` → `null`; a `privateAggregates` entry `{ membershipId: 'maelle', total: 10000n, savings: 2000n }` adds 10000n to her DI and 2000n to her savings; summary is identical when lines are shuffled
- [X] T008 [P] Write `packages/shared/test/planning/spreadsheet-bugs.spec.ts`, the regression tests for the two spreadsheet bugs: (1) the fixture's Spotify amount typed as text `'12,5'` is parsed to 1250n and Maëlle's DI is 14432n (not 13182n); (2) a shared line where Maëlle's share is `0n` and Fabien's is 4000n still appears in both members' DCR computation, and Σ members' (DI + DCR + DCE) equals household planned
- [X] T009 [P] Write `packages/shared/test/planning/summary.property.spec.ts` with fast-check (`numRuns: 1000`): generator of months with 1–6 members, 0–80 lines over all groups/kinds/split modes, amounts 0–100 000 000 minor units generated as strings with `,` or `.` and fed through `parseAmount`, random counted/non-counted incomes, random private aggregates, periodic formulas. An **independent oracle** written inside the test file (plain loops over lines, no import from `src/domain/planning`) recomputes every member and household figure; assert equality to the cent. Also assert: shares of each line sum to its total; household planned = Σ members (DI + DCR + DCE); result invariant under line order
- [X] T010 [P] Write `packages/shared/test/planning/month-status.spec.ts` for `transitionMonth(from, action)`: `draft`+`activate` → `active`; `active`+`close` → `closed`; `closed`+`reopen` → `active`; every other pair throws `INVALID_TRANSITION`. And `requiredPermission(action)`: activate → `months.activate`, close → `months.close`, reopen → `months.reopen`
- [X] T011 [P] Write `packages/shared/test/planning/label.spec.ts` for `monthLabelFor({ start, end })` → `{ year, month }` (month 1–12) = calendar month holding most days of the period, ties to the later month: `2026-11-01..2026-11-30` → 2026/11; `2026-10-28..2026-11-27` → 2026/11; `2026-11-02..2026-12-01` → 2026/11; `2026-10-15..2026-11-14` → 2026/10; `2026-12-28..2027-01-27` → 2027/1; a 45-day transition month spanning three calendar months
- [X] T012 [P] Extend `packages/shared/test/permissions.spec.ts`: `months.create`, `months.activate`, `months.close` → owner, admin, member only; `months.reopen` → owner, admin only; viewer has none of them
- [X] T013 [P] Extend `packages/shared/test/money.spec.ts`: `MAX_AMOUNT_MINOR` = `100_000_000n` (1 000 000,00 €); `parseBoundedAmount(input, currency)` returns `null` for `'1 000 000,01'`, `'-3'`, `'12,5a'`, `'12,555'`, `'1,2,3'`, `''`, and 1250n for `'12,5'`, `'12.5'`; 123456n for `'1 234,56'`

### Domain implementation

- [X] T014 [P] Implement `splitByWeights` and `computeShares` in `packages/shared/src/domain/planning/split.ts` (bigint only; largest remainder; ties broken by `PlanMember.order`; `DomainRuleError` codes `SPLIT_MISMATCH` with `differenceMinor`, `NO_INCOME_FOR_PROPORTIONAL`) so T005 passes. Define the types `PlanMember`, `PlanIncome`, `PlanLine`, `SplitMode` from data-model.md "Shared domain types" in `packages/shared/src/domain/planning/types.ts`
- [X] T015 [P] Implement `monthlyFromFormula` and the `Formula` type in `packages/shared/src/domain/planning/formula.ts` so T006 passes
- [X] T016 Implement `computeMonthSummary`, `savingsRatePermille` (integer half-up, `null` when income is 0) and `MemberSummary`/`MonthSummary` types in `packages/shared/src/domain/planning/summary.ts` so T007, T008 and T009 pass (depends on T014)
- [X] T017 [P] Implement `transitionMonth`, `requiredPermission` and `MonthStatus`/`MonthAction` in `packages/shared/src/domain/planning/month-status.ts` so T010 passes
- [X] T018 [P] Implement `monthLabelFor` in `packages/shared/src/domain/planning/label.ts` so T011 passes (reuse `addDays`/`daysBetween` from `budget-month.ts`)
- [X] T019 [P] Add `months.create`, `months.activate`, `months.close` (owner, admin, member) and `months.reopen` (owner, admin) to `PERMISSIONS` and `ALLOWED` in `packages/shared/src/domain/permissions.ts` so T012 passes
- [X] T020 [P] Add `MAX_AMOUNT_MINOR` and `parseBoundedAmount` to `packages/shared/src/domain/money.ts` so T013 passes
- [X] T021 Create `packages/shared/src/domain/planning/index.ts` re-exporting the planning modules, export it from `packages/shared/src/domain/index.ts`, then run `pnpm --filter @two-cents/shared test` and `pnpm --filter @two-cents/shared build`

### Contracts (Principle VII), shapes from contracts/rest-api.md

- [X] T022 [P] Add `SignedAmountMinor = z.string().regex(/^-?\d{1,18}$/)` to `packages/shared/src/contracts/budgets.ts`
- [X] T023 [P] Create `packages/shared/src/contracts/months.ts`: `MonthStatus`, `CreateMonthRequest` (discriminated `source`: `previous` | `month` {monthStart, includeOneOff?} | `template` {templateId} | `scratch`), `MonthListItem`, `MonthDetail` (with `month`, `currency`, `members`, `incomes`, `lines`, `privateAggregates`, `summary`, `actuals: null`, `flags`, `can`), `MonthSummaryView`, `ChangeView`, `ChangeStatusRequest` (`action: 'activate' | 'close' | 'reopen'`), `ListMonthsResponse`, `HistoryResponse` — exactly as in contracts/rest-api.md
- [X] T024 [P] Create `packages/shared/src/contracts/lines.ts`: `Group`, `Kind`, `SplitMode`, `Scope`, `Formula` (`factor` int 1–99), `LineAmountInput`, `CreateLineRequest` (label "1–60 chars after trim", NFC), `UpdateLineRequest` (`expectedVersion` int ≥ 1), `ReorderLinesRequest`, `LineView`; `subItems` labels "1–40 chars"
- [X] T025 [P] Rewrite `packages/shared/src/contracts/incomes.ts` (keep the 002 `PutIncomeRequest` export unchanged): add `IncomeLineView`, `CreateIncomeRequest` (`label` "1–40 chars" optional, `amountMinor`, `countsTowardHousehold` default true), `UpdateIncomeRequest` (`expectedVersion`)
- [X] T026 [P] Create `packages/shared/src/contracts/categories.ts` (`Category` {id, systemKey, name, position}; `CreateCategoryRequest` name "1–40 chars"; `UpdateCategoryRequest`), `packages/shared/src/contracts/templates.ts` (`TemplateLine`, `TemplateSummary`, `CreateTemplateRequest` {name "1–60 chars", fromMonthStart}, `RenameTemplateRequest`) and `packages/shared/src/contracts/imports.ts` (`ImportRequest` with `months.max(36)`, `ImportPreviewResult`, `ImportCommitResponse`)
- [X] T027 Export the new contract modules from `packages/shared/src/contracts/index.ts`; run `pnpm --filter @two-cents/shared build` and `pnpm -r typecheck`

### Database (data-model.md)

- [X] T028 Create `backend/src/shared-kernel/infrastructure/db/schema/planning.ts` with Drizzle tables `budget_month`, `budget_category`, `budget_line`, `budget_line_share`, `envelope_sub_item`, `income_line`, `month_change`, `month_template` and their enums, with every column, check, unique and index from data-model.md, including: `budget_month` unique `(budget_id, period_start)`, check `(status = 'closed') = (closed_summary IS NOT NULL)`; `budget_line` checks `(group = 'personal') = (owner_membership_id IS NOT NULL)`, `(group = 'personal') = (split_mode IS NULL)`, `NOT is_private OR group = 'personal'`, `(split_mode = 'one_payer') = (payer_membership_id IS NOT NULL)`, label "1–60 chars after trim", `total_minor BETWEEN 0 AND 100000000`, indexes `(month_id, group, position)` and `(budget_id, series_id)`; `income_line` unique partial `(month_id, membership_id) WHERE is_primary`; `month_change` index `(month_id, id)`. Export from `schema/index.ts`
- [X] T029 Run `pnpm --filter two-cents-backend exec drizzle-kit generate --name monthly_planning` to produce `backend/drizzle/0004_monthly_planning.sql`, then append by hand: (a) the **deferrable constraint trigger** `budget_line_shares_sum` (`DEFERRABLE INITIALLY DEFERRED`, on insert/update/delete of `budget_line_share` and update of `budget_line.total_minor`) raising when Σ `amount_minor` ≠ `total_minor`; (b) seed 10 `budget_category` rows (`housing, food, transport, pets, leisure, health, subscriptions, savings, gifts, other`, `name` null) for every existing budget; (c) for each `member_income` row: insert an empty `budget_month` (`status 'draft'`, `created_from 'income'`, period from the row's `month_start` and the budget's start rules — compute `period_end` in SQL as next start − 1 day for start-day rules, or create rows from a one-off TS script `backend/scripts/migrate-member-income.ts` if SQL is impractical) and one `income_line` (`label` null, `counts_toward_household` true, `is_primary` true, `version` 1); (d) `DROP TABLE member_income`. Apply with `pnpm --filter two-cents-backend db:migrate` on dev and test databases
- [X] T030 Write `backend/test/planning/migration.e2e-spec.ts`: seeds a 002-era `member_income` row before running migration 0004 on a fresh test schema, then asserts one `budget_month` + one primary `income_line` exist with the same amount, 10 categories per budget, and that inserting shares not summing to the line total fails at commit (deferred trigger)

### Rewire 002 income onto income_line (research R13)

- [X] T031 Replace `backend/src/budgets/domain/entities/member-income.ts` usage: change `IncomeRepository` in `backend/src/budgets/domain/ports/repositories.ts` to `upsertPrimary(monthStart, membershipId, amountMinor, by, now)` (creates the empty Draft month with `created_from 'income'` if missing, refuses with `MONTH_CLOSED` when the month is Closed), `countedIncomeForMonth(budgetId, monthStart)` and `existsForBudget(budgetId)` (true when any `income_line` **or** `budget_line` exists — FR-006 currency lock); implement in `backend/src/budgets/infrastructure/persistence/drizzle-other.repositories.ts`; update `RecordIncome` in `backend/src/budgets/application/use-cases/income.ts` to return the caller's counted income total and `budget-views.ts` so `MemberView.currentMonthIncome` = counted income sum. Delete `member-income.ts` once unused. Existing `backend/test/budgets/*.e2e-spec.ts` must still pass unchanged

### Backend planning module skeleton

- [X] T032 [P] Create domain entities in `backend/src/planning/domain/entities/`: `budget-month.ts` (status via `transitionMonth`, `revision`, `assertWritable()` → `MONTH_CLOSED`), `budget-line.ts` (invariants from data-model.md checks, `version`, `handEdited`, `usual`, `needsReview`, `needsIncome`, shares map, sub-items; `applyAmount(input, members, incomes)` using `computeShares`/`monthlyFromFormula`), `income-line.ts` (`amount` bounded by `MAX_AMOUNT_MINOR`, `toConfirm`, `isPrimary`, `version`), `month-template.ts`, `category.ts`; with `backend/src/planning/domain/entities/entities.spec.ts` covering each invariant (personal ⇒ owner and no split; private ⇒ personal; one_payer ⇒ payer; version increments on change)
- [X] T033 [P] Declare repository ports in `backend/src/planning/domain/ports/repositories.ts`: `MonthRepository` (`findByStart(budgetId, start, { forUpdate })`, `list(budgetId, cursor, limit)`, `save`, `bumpRevision`, `revisionOf(budgetId, start)`), `LineRepository` (`listForMonth`, `findById`, `save`, `delete`, `findLaterInSeries(budgetId, seriesId, afterStart)`), `IncomeLineRepository`, `ChangeLog` (`record(change)`, `list(monthId, cursor, includeDraft)`), `TemplateRepository`, `CategoryRepository`; and application ports in `backend/src/planning/application/ports/index.ts`: `ActualsProvider` (`forMonth(monthId): Promise<null>`), `MonthMembershipSync`
- [X] T034 Implement Drizzle repositories + mappers in `backend/src/planning/infrastructure/persistence/` (`drizzle-month.repository.ts`, `drizzle-line.repository.ts` loading lines + shares + sub-items in 3 queries, `drizzle-income-line.repository.ts`, `drizzle-change-log.ts`, `drizzle-template.repository.ts`, `drizzle-category.repository.ts`), using the current transaction from `TransactionRunner`; `FOR UPDATE` on the month row when asked
- [X] T035 Implement `MonthWriter` in `backend/src/planning/application/services/month-writer.ts`: `write(auth, budgetId, monthStart, permission, fn)` runs in one transaction: `BudgetAccess.require(..., { forUpdate: false })`, locks the month row, `assertWritable()`, runs `fn(ctx)` where `ctx` gives contributing members (`isIncludedInMonth`), incomes, lines and `record(change)`; then bumps `revision` once and returns the month start. Unit test `month-writer.spec.ts` with in-memory fakes: closed month → `MONTH_CLOSED`; one revision bump per write; change records written with `month_status`
- [X] T036 Implement `MonthDetailView` in `backend/src/planning/application/services/month-detail-view.ts`: builds `MonthDetail` for the caller — members (contributing, `order` by `joined_at` then id), incomes (`editable` only for own lines when not Closed), lines sorted by group/owner/position (`editable` per FR-018), `summary` from `computeMonthSummary` (or `closed_summary` when Closed), `actuals` from `ActualsProvider`, `flags`, `can`. Private-line redaction is added in US4 (T086); for now every line is returned
- [X] T037 Register error codes in `backend/src/shared-kernel/presentation/http-status.ts`: `MONTH_NOT_FOUND` 404, `INVALID_MONTH` 400, `MONTH_EXISTS` 409, `MONTH_CLOSED` 409, `INVALID_TRANSITION` 409, `LINES_NEED_REVIEW` 409, `SPLIT_MISMATCH` 400, `NO_INCOME_FOR_PROPORTIONAL` 400, `SUB_ITEMS_EXCEED_TOTAL` 400, `AMOUNT_TOO_LARGE` 400, `SCOPE_REQUIRED` 422, `NOT_LINE_OWNER` 403, `NOT_INCOME_OWNER` 403, `TEMPLATE_NAME_TAKEN` 409, `IMPORT_INVALID` 400, `STALE_STATE` (exists, 409); make the domain error filter include `differenceMinor` (string) for `SPLIT_MISMATCH` and `current` for `STALE_STATE`
- [X] T038 Create `backend/src/planning/planning.module.ts` binding ports → adapters (`ActualsProvider` → `NullActualsProvider` in `backend/src/planning/infrastructure/null-actuals.provider.ts`), importing the budgets core module for `BudgetAccess`, and register it in `backend/src/app.module.ts`
- [X] T039 [P] Create `backend/test/support/planning.ts` e2e helpers: `seedHousehold()` (owner Fabien, member Maëlle, viewer Victor, outsider Olivia with sessions), `createMonth(budgetId, periodStart, source)`, `addLine(...)`, `addIncome(...)`, `seedNovembre2026(budgetId)` building the T004 fixture through the API

### Mobile plumbing

- [X] T040 Extend `mobile/src/auth/api-client.ts` so a request can send `If-None-Match` and receive `{ status: 304 }` without throwing, exposing the response `ETag`; add a test in `mobile/src/auth/api-client.test.ts`
- [X] T041 [P] Create `mobile/src/features/planning/query-keys.ts` and `mobile/src/features/planning/api.ts` with typed calls for every route in contracts/rest-api.md (parsed with the shared Zod schemas), and `useMonth(budgetId, monthStart)` in `mobile/src/features/planning/use-month.ts`: TanStack Query with `refetchInterval: 2000` only while the screen is focused and the app is active, sending `If-None-Match: "<revision>"` and keeping cached data on 304 (research R4); every mutation hook writes the returned `MonthDetail` into the cache
- [X] T042 [P] Create the single amount display component `mobile/src/components/amount.tsx` (if no amount component exists yet): renders a `Money` or signed minor string through `formatMoney` (extend `formatMoney` in `mobile/src/features/budgets/format.ts` to accept a leading `-`), tabular figures (`fontVariant: ['tabular-nums']`), accessibility label reading the sign ("moins 6 euros 84"); test `mobile/src/components/amount.test.tsx`
- [X] T043 [P] Create `mobile/src/features/planning/amount-field.tsx`: text input (decimal keyboard) using `parseBoundedAmount`, inline error key per failure (`planning.amount.invalid`, `planning.amount.tooLarge`), exposes `minor: string | null`; test `mobile/src/features/planning/amount-field.test.tsx` (`12,5` → `'1250'`, `12,5a` / `12,555` / `-3` → error and `null`)
- [X] T044 [P] Add the `planning.*` i18n namespace to `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json` (group names "Dépenses individuelles (DI)", "Communes récurrentes (DCR)", "Communes exceptionnelles (DCE)", "Reste à vivre", "Virement au compte joint", "Dépassement", "Privé", "Revenu", statuses, the 10 default categories, every new error code under `errors.*`)
- [X] T045 [P] Create `mobile/src/features/planning/overrun-badge.tsx` (warning icon via `expo-symbols` + text "Dépassement", never color alone, Principle VIII) and `mobile/src/features/planning/summary-header.tsx` (per member: what's left with `Amount` + overrun badge, transfer; collapsible to show DI/DCR/DCE/savings rate; household totals), with `summary-header.test.tsx` rendering the Novembre summary

**Checkpoint**: shared tests green, migration applied, planning module boots, mobile plumbing compiles — user stories can start

---

## Phase 3: User Story 1 - Plan a month and see what each member has left (Priority: P1) 🎯 MVP

**Goal**: Create an empty month, enter incomes and budget lines (custom split) in DI/DCR/DCE, see the live summary with overrun warning, and see the partner's edits within 5 s.

**Independent Test**: Enter the Novembre 2026 example in an empty month; the summary shows Maëlle −6,84 € ⚠ / transfer 1 862,52 € and Fabien 158,16 € / transfer 2 242,52 € (quickstart scenarios 1–3).

### Tests for User Story 1 ⚠️ (write first, see them fail)

- [X] T046 [P] [US1] Write `backend/test/planning/us1-plan-month.e2e-spec.ts`: `POST /months` with `source: scratch` → 201 Draft; second create → `409 month_exists`; `periodStart` not a period start or beyond next month → `400 invalid_month`; `seedNovembre2026` then `GET month` → summary equals the T004 expected figures (strings); income `amountMinor: '12,5'` → 400 validation_failed; line with total `100000001` → 400; Maëlle editing Fabien's personal line → `403 not_line_owner`; Fabien editing Maëlle's income → `403 not_income_owner`; Viewer `POST lines` → 403; non-member → 404 `budget_not_found`
- [X] T047 [P] [US1] Write `backend/test/planning/us1-sync-and-conflicts.e2e-spec.ts`: `GET month` returns `ETag: "<revision>"`; same `If-None-Match` → 304 with empty body; after Maëlle's `PATCH` the revision changes and Fabien's next GET is 200; two `PATCH` with the same `expectedVersion` → second gets `409 stale_state` with `current` line; `PUT lines/order` with a wrong id set → 409; `DELETE` with stale version → 409
- [X] T048 [P] [US1] Add every US1 route to `backend/test/authz/budget-route-cases.ts`: `GET /v1/budgets/:budgetId/months/:monthStart` (viewer allowed), `POST /v1/budgets/:budgetId/months` (forbidden), `POST|PATCH|DELETE …/lines…`, `PUT …/lines/order`, `POST|PATCH|DELETE …/incomes…` (forbidden), with valid bodies and params
- [X] T049 [P] [US1] Write use-case unit tests `backend/src/planning/application/use-cases/us1.spec.ts` with in-memory fakes: personal line created for another member → `NOT_LINE_OWNER`; shared custom line with entered shares computes the total; total + shares that differ → `SPLIT_MISMATCH` with difference; each write records a `month_change` with old/new values; income lines only for own membership
- [X] T050 [P] [US1] Write `mobile/src/features/planning/use-live-summary.test.ts`: applying an unsaved line edit (e.g. Courses Fabien 300 → 400) to the cached `MonthDetail` recomputes Fabien's what's left immediately with `computeMonthSummary` and matches the server summary after save

### Implementation for User Story 1

- [X] T051 [US1] Implement `CreateMonth` (scratch only for now) in `backend/src/planning/application/use-cases/create-month.ts`: permission `months.create`; period must equal `budgetMonthFor(periodStart, rules).start` and be ≤ the next month after today (budget time zone) else `INVALID_MONTH`; `MONTH_EXISTS` when a month with lines exists; an existing month without lines (e.g. `created_from 'income'`) is returned as-is; records `month_change` (`entity 'month'`, `action 'created'`)
- [X] T052 [US1] Implement `GetMonth` in `backend/src/planning/application/use-cases/get-month.ts` (`budget.read`; `MONTH_NOT_FOUND`), returning `MonthDetailView` output, plus `revisionOf` for the cheap ETag path
- [X] T053 [US1] Implement income use cases in `backend/src/planning/application/use-cases/income-lines.ts`: `AddIncomeLine`, `UpdateIncomeLine` (`expectedVersion`, clears `toConfirm`), `DeleteIncomeLine` — via `MonthWriter`, permission `income.write.own`, only the caller's own lines (`NOT_INCOME_OWNER`), caller must be contributing in the month, amounts ≤ `MAX_AMOUNT_MINOR`, change records with old/new amounts
- [X] T054 [US1] Implement line use cases in `backend/src/planning/application/use-cases/lines.ts`: `CreateLine`, `UpdateLine` (`expectedVersion` → `STALE_STATE` with current `LineView`), `DeleteLine`, `ReorderLines` (full id set of one section `(group, ownerMembershipId)`; mismatch → `STALE_STATE`) — via `MonthWriter`, permission `entries.write`; personal lines only by/for their owner (`NOT_LINE_OWNER`), one share row for the owner; shared lines default `split_mode 'custom'` with a share row for every contributing member (`0` allowed); `amount.entry 'total'` or `'shares'` through `computeShares`; new `series_id` for each created line; positions appended at the end of the section; `hand_edited` set when amount fields change; change records per changed field
- [X] T055 [US1] Implement controllers in `backend/src/planning/presentation/http/months.controller.ts` (`POST /budgets/:budgetId/months`, `GET /budgets/:budgetId/months/:monthStart` comparing `If-None-Match` to the stored revision **before** loading lines → `304`, else 200 with `ETag`; disable Express's automatic ETag on this route), `lines.controller.ts` and `incomes.controller.ts` per contracts/rest-api.md, guarded by `BudgetAccessGuard` + `@RequirePermission`, bodies validated by `ZodValidationPipe` with the shared schemas, every write returning `MonthDetail`
- [X] T056 [US1] Create `mobile/src/features/planning/use-live-summary.ts`: takes the cached `MonthDetail` plus an optional draft line/income edit and returns `computeMonthSummary` output (same shared function as the backend), so T050 passes
- [X] T057 [P] [US1] Create `mobile/src/features/planning/line-row.tsx` (label, kind badge for savings, total + per-member shares via `Amount`, lock icon + read-only when `editable` is false, 44 pt target, accessibility label "Courses, 400 euros, Maëlle 100, Fabien 300")
- [X] T058 [P] [US1] Create `mobile/src/features/planning/conflict-dialog.tsx`: on `409 stale_state`, show "Modifié par {{name}} entre-temps" with their value vs yours and "Garder la mienne" (re-send with the new version) / "Garder la leur" (discard)
- [X] T059 [US1] Create the month screen `mobile/src/app/(app)/budgets/[budgetId]/months/[monthStart]/index.tsx`: `useMonth` polling, sticky `SummaryHeader` driven by `useLiveSummary`, sections Incomes, DI per member, DCR, DCE with `LineRow`, "+" per section, "Organiser" mode with move up/down buttons calling `PUT lines/order`, empty state, offline/edit disabled when `can` is false (Viewer)
- [X] T060 [US1] Create the line form sheet `mobile/src/app/(app)/budgets/[budgetId]/months/[monthStart]/line.tsx` (route presented as `formSheet`): label, group, kind, owner (personal: me), per-member `AmountField`s or total, live "Il manque 50,00 €" difference, Save disabled while invalid or mismatched, delete with confirmation, haptic success on save, conflict dialog on 409
- [X] T061 [US1] Create the income screen `mobile/src/app/(app)/budgets/[budgetId]/months/[monthStart]/income.tsx`: my income lines (label, `AmountField`, "Compte dans le budget du foyer" switch, add/delete), others' incomes read-only, non-counted incomes shown as "non compté"
- [X] T062 [US1] Add an entry point "Budget du mois" from `mobile/src/app/(app)/budgets/[budgetId]/index.tsx` to the current month (create it from scratch if missing; US2 replaces this with the creation sheet), leaving the existing quick actions in place (Principle IV)

**Checkpoint**: US1 works end to end — Novembre 2026 is plannable and shows the exact figures on both devices

---

## Phase 4: User Story 2 - Start a new month from the previous one (Priority: P1)

**Goal**: Create a month from the previous month, a past month, a template or scratch; recurring lines copied, one-off not, incomes pre-filled "to confirm"; templates saved and managed.

**Independent Test**: Create Décembre 2026 from Novembre: every DI/DCR line identical, no DCE, incomes badged "À confirmer" (quickstart scenario 6).

### Tests for User Story 2 ⚠️

- [X] T063 [P] [US2] Write `packages/shared/test/planning/copy.spec.ts` for `copyLinesForNewMonth(sourceLines, targetMembers, { includeOneOff })`: copies `personal` and `recurring_shared` only (plus `one_off_shared` when `includeOneOff`); keeps `seriesId` for recurring, new `seriesId` for one-off copies; uses `usual` values when present; resets `version` to 1, `handEdited`/`needsIncome` false; drops personal lines of non-contributing members; drops shares of non-contributing members and sets `needsReview` on `custom`/`one_payer` lines that lost a non-zero share; recomputes equal lines over target members; adds `0` shares for new members on custom lines; keeps positions, category, kind, envelope, sub-items, privacy, formula
- [X] T064 [P] [US2] Write `backend/test/planning/us2-new-month.e2e-spec.ts`: Novembre with 25 recurring + 2 one-off lines → `POST months { periodStart: '2026-12-01', source: { kind: 'previous' } }` → Décembre has 25 lines with identical fields and shares, no one-off; incomes copied with `toConfirm: true` and counted in the summary; `POST incomes/confirm` clears only the caller's flags; `previous` with no earlier month → `400 invalid_month`; filling an existing empty month (`created_from 'income'`) keeps its income; templates: create from Novembre, list, rename, duplicate name → `409 template_name_taken`, create a month from it (no incomes), delete
- [X] T065 [P] [US2] Add `POST …/incomes/confirm`, `GET|POST /v1/budgets/:budgetId/templates`, `PATCH|DELETE /v1/budgets/:budgetId/templates/:templateId` to `backend/test/authz/budget-route-cases.ts`

### Implementation for User Story 2

- [X] T066 [US2] Implement `copyLinesForNewMonth` in `packages/shared/src/domain/planning/copy.ts` so T063 passes; export it
- [X] T067 [US2] Extend `CreateMonth` in `backend/src/planning/application/use-cases/create-month.ts` with sources `previous` (latest month whose start < periodStart), `month` (by `monthStart`, `includeOneOff`), `template` (lines from the template) using `copyLinesForNewMonth`; copy incomes for `previous`/`month` with `to_confirm = true` (members still contributing only); set `created_from`, `source_month_id`/`source_template_id`; one `month_change` with the source
- [X] T068 [US2] Implement `ConfirmIncomes` in `backend/src/planning/application/use-cases/income-lines.ts` (caller's lines only, change record `action 'confirmed'`) and expose `POST /budgets/:budgetId/months/:monthStart/incomes/confirm` in `incomes.controller.ts`
- [X] T069 [US2] Implement templates in `backend/src/planning/application/use-cases/templates.ts` (`SaveTemplate` from a month: all lines as `TemplateLine[]` validated with the shared Zod schema, keeping only the saver's own private lines; `ListTemplates`, `RenameTemplate`, `DeleteTemplate`; name "1–60 chars", unique per budget case-insensitive → `TEMPLATE_NAME_TAKEN`) and `backend/src/planning/presentation/http/templates.controller.ts`
- [X] T070 [US2] Create the creation sheet `mobile/src/app/(app)/budgets/[budgetId]/months/new.tsx`: target period (current or next), source choice "À partir du mois précédent" (default) / "Depuis un modèle" (list) / "Partir de zéro", then opens the new month; replace the T062 entry point so a missing month opens this sheet
- [X] T071 [US2] On the month screen, show a "À confirmer" badge on pre-filled incomes and a banner "Confirmez vos revenus" with one-tap confirm (calls `incomes/confirm`, haptic) in `mobile/src/app/(app)/budgets/[budgetId]/months/[monthStart]/index.tsx` and `income.tsx`
- [X] T072 [US2] Create `mobile/src/app/(app)/budgets/[budgetId]/months/templates.tsx` (list, rename, delete with confirmation) and an "Enregistrer comme modèle" action on the month screen

**Checkpoint**: US1 + US2 cover the monthly routine end to end (MVP)

---

## Phase 5: User Story 3 - Split shared lines and enter periodic amounts (Priority: P2)

**Goal**: Equal, proportional and one-payer splits; periodic formulas with hint; proportional recompute on income change; categories; envelope flag and sub-items.

**Independent Test**: Incomes 2 000/3 000: 500 € proportional → 200/300, equal → 250/250; "80 € par an" → 6,67 € with hint (quickstart scenario 4).

### Tests for User Story 3 ⚠️

- [X] T073 [P] [US3] Write `packages/shared/test/planning/sub-items.spec.ts` for `validateSubItems(total, subItems)`: Σ non-null amounts ≤ total passes; greater → `SUB_ITEMS_EXCEED_TOTAL`; null amounts ignored; labels "1–40 chars"
- [X] T074 [P] [US3] Write `backend/test/planning/us3-splits.e2e-spec.ts`: proportional 500 € with incomes 2 000/3 000 → 200/300; switch to equal → 250/250; equal 10,01 € → 5,01/5,00; one_payer Fabien 60 € → 60/0; custom mismatch → `400 split_mismatch` with `differenceMinor`; formula `per_year 8000` → total 667 and `formula` returned; `times 4700 × 2` → 9400; changing Fabien's income recomputes proportional lines in the same response and adds `cause 'recompute'` history entries; proportional with 0 counted income → `400 no_income_for_proportional`; deleting all incomes after → line `needsIncome: true` keeping its shares; sub-items exceeding total → 400; categories: list 10 defaults, create, rename, delete → line `categoryId` null
- [X] T075 [P] [US3] Add `GET|POST /v1/budgets/:budgetId/categories` and `PATCH|DELETE /v1/budgets/:budgetId/categories/:categoryId` to `backend/test/authz/budget-route-cases.ts`

### Implementation for User Story 3

- [X] T076 [US3] Implement `validateSubItems` in `packages/shared/src/domain/planning/sub-items.ts` so T073 passes
- [X] T077 [US3] Extend `CreateLine`/`UpdateLine` in `backend/src/planning/application/use-cases/lines.ts` for `split.mode` `equal` | `proportional` | `one_payer` (payer must be contributing), `amount.formula` (total = `monthlyFromFormula`), `isEnvelope`, `subItems` (replace set, `validateSubItems`), `categoryId` (must belong to the budget)
- [X] T078 [US3] Implement `RecomputeProportional` in `backend/src/planning/application/services/recompute-proportional.ts` called by every income use case inside the same `MonthWriter` transaction: recompute all `proportional` lines of the month; when counted income is 0 keep shares and set `needs_income`; clear it otherwise; one change record per changed line with `cause 'recompute'`, actor = income editor; does not set `hand_edited`
- [X] T079 [US3] Implement categories in `backend/src/planning/application/use-cases/categories.ts` (`ListCategories`, `CreateCategory` name "1–40 chars" unique per budget case-insensitive, `RenameCategory`/reorder, `DeleteCategory`) + `backend/src/planning/presentation/http/categories.controller.ts`; seed the 10 default categories when a budget is created (hook into 002 `CreateBudget` in `backend/src/budgets/application/use-cases/budgets.ts` via a `CategorySeeder` port)
- [X] T080 [P] [US3] Create `mobile/src/features/planning/split-picker.tsx` (Montants personnalisés / Moitié-moitié / Au prorata des revenus with the % shown / Un seul paie + member choice; disabled proportional with explanation when no income) and use it in `line.tsx` for shared lines
- [X] T081 [P] [US3] Create `mobile/src/features/planning/formula-input.tsx` (Mensuel / Par an / Par semestre / Par trimestre / × N, base `AmountField`, live monthly result and hint "80 €/an ÷ 12" via i18n) and show the hint under the amount in `line-row.tsx`
- [X] T082 [P] [US3] Create `mobile/src/features/planning/sub-items-editor.tsx` (shown when "Enveloppe" is on; label + optional amount; remaining amount shown) and a category picker in `line.tsx`
- [X] T083 [US3] Create `mobile/src/app/(app)/budgets/[budgetId]/months/categories.tsx` (list, add, rename, reorder with buttons, delete with "les lignes deviendront sans catégorie"); default categories labelled from i18n by `systemKey` while `name` is null

**Checkpoint**: US3 removes manual arithmetic; US1/US2 still pass

---

## Phase 6: User Story 4 - Personal lines and privacy (Priority: P2)

**Goal**: Others see personal lines read-only; private lines appear to others only as one "Privé" amount per member, everywhere.

**Independent Test**: Maëlle's private "Psy" 60 € + "Cadeau" 40 € → Fabien sees "Privé — 100,00 €", Maëlle's DI includes it (quickstart scenario 5).

### Tests for User Story 4 ⚠️

- [X] T084 [P] [US4] Write `backend/test/planning/us4-privacy.e2e-spec.ts`: Maëlle creates private personal lines "Psy" 6000 and "Cadeau surprise" 4000 (one savings); for Fabien and Victor (viewer) the serialized JSON of `GET month`, `GET history` (both `all` values), `GET templates`, and the responses of Fabien's own writes **contain neither "Psy", "Cadeau surprise", "6000" nor "4000" as a line field** (string search on labels; amounts checked via `lines` absence and `privateAggregates` = `{ totalMinor: '10000', savingsMinor: …, count: 2 }`); Maëlle sees both lines with `isPrivate: true`; summaries for Fabien and Maëlle are identical; `isPrivate` on a shared line → 400; moving a private line to a shared group clears `isPrivate`; Fabien `PATCH` on Maëlle's line → 403 `not_line_owner`
- [X] T085 [P] [US4] Write `mobile/src/features/planning/private-row.test.tsx`: Maëlle's section on Fabien's device renders one "Privé" row with 100,00 € and no edit affordance

### Implementation for User Story 4

- [X] T086 [US4] Add private-line redaction to `MonthDetailView` in `backend/src/planning/application/services/month-detail-view.ts`: for callers other than the owner, omit private lines and fill `privateAggregates` (total, savings, count per owner); compute `summary` server-side from all lines (identical for everyone); apply the same rule to `closed_summary` reads and to every write response
- [X] T087 [US4] Enforce privacy rules in `backend/src/planning/application/use-cases/lines.ts`: `isPrivate` only for personal lines (else validation error), cleared when the group changes away from personal; ownership required for any personal-line change; private lines in templates kept only for the saver (verify T069 behaviour)
- [X] T088 [US4] Create `mobile/src/features/planning/private-row.tsx` and render it in each member's DI section on the month screen; add the "Privé" switch (personal lines only, own lines only) with the explanation "Les autres ne verront que le montant total" in `line.tsx`

**Checkpoint**: privacy leak test green

---

## Phase 7: User Story 5 - Agree on the plan, track changes, close and reopen (Priority: P2)

**Goal**: Draft → Active → Closed → (reopen) Active; change history readable by everyone; closed months frozen with planned vs actual.

**Independent Test**: Activate, change Courses 280 → 300, see the history sentence; close → edits refused; reopen as owner (quickstart scenario 8).

### Tests for User Story 5 ⚠️

- [X] T089 [P] [US5] Write `backend/test/planning/us5-lifecycle.e2e-spec.ts`: Member activates → `status 'active'` and history `activated`; activate again → `409 invalid_transition`; activation with a `needsReview` line → `409 lines_need_review` with `lineIds`; after activation Fabien's change 28000 → 30000 on Courses appears in `GET history` as `{ actor: Fabien, entity: 'line', action: 'updated', label: 'Courses', changes: [{ field: 'totalMinor', old: '28000', new: '30000' }] }`; `GET history` without `all` excludes Draft-time changes, with `all=true` includes them; Member closes → every write route (lines, incomes, order, confirm, templates-from-month is allowed) → `409 month_closed`; closed `GET month` returns the frozen summary even after an income in another month changes; Maëlle (member) reopen → 403; Fabien (owner) reopen → `active` and edits work; an Admin can reopen; `actuals` is `null`; private line changes show as `private: true` with no label/changes for Fabien
- [X] T090 [P] [US5] Add `POST /v1/budgets/:budgetId/months/:monthStart/status` (forbidden for viewer) and `GET …/history` (viewer allowed) to `backend/test/authz/budget-route-cases.ts`

### Implementation for User Story 5

- [X] T091 [US5] Implement `ChangeMonthStatus` in `backend/src/planning/application/use-cases/change-status.ts`: permission from `requiredPermission(action)`; `transitionMonth`; activate refuses when any line `needs_review` (`LINES_NEED_REVIEW`); close stores `closed_summary` (unredacted `computeMonthSummary` serialized as strings) and `closed_at/by`; reopen clears them; sets `activated_at/by` on first activation; change record; revision bump. `MonthWriter` lets this use case bypass `assertWritable` for `reopen` only
- [X] T092 [US5] Implement `GetMonthHistory` in `backend/src/planning/application/use-cases/history.ts`: cursor pagination (`id` desc, 50 per page), `all=false` → only records with `month_status` ≠ `draft`; maps to `ChangeView` with `PersonRef` actors (former member labels as in 002); redacts records with `is_private` for anyone but `owner_membership_id`
- [X] T093 [US5] Expose `POST /budgets/:budgetId/months/:monthStart/status` and `GET /budgets/:budgetId/months/:monthStart/history` in `backend/src/planning/presentation/http/months.controller.ts`
- [X] T094 [P] [US5] Create `mobile/src/features/planning/history-sentence.ts` turning a `ChangeView` into an i18n sentence ("{{actor}} a modifié {{label}} de {{old}} à {{new}}", "{{actor}} a modifié une ligne privée", recompute/propagation/import variants) with `history-sentence.test.ts`
- [X] T095 [US5] Create `mobile/src/app/(app)/budgets/[budgetId]/months/[monthStart]/history.tsx` (infinite list, "Tout afficher" toggle for Draft changes, dates via `Intl`)
- [X] T096 [US5] Add status controls to the month screen: "Valider le plan" (Draft → Active, confirmation + haptic), "Clôturer le mois" (confirmation explaining freezing), "Rouvrir" only when `can.changeStatus` includes `reopen`; status chip in the header; Closed state disables all edit controls and shows planned figures with a "Réel" column only when `actuals` is non-null

**Checkpoint**: the agreed plan is traceable and closable

---

## Phase 8: User Story 6 - Change a recurring line from this month on, or this month only (Priority: P2)

**Goal**: The scope choice on recurring amount changes; exceptions keep the usual value for later copies; "from this month on" propagates to later Draft months not edited by hand.

**Independent Test**: Loyer 900 → 950 "à partir de ce mois" and Courses 400 → 600 "ce mois-ci uniquement" in Novembre; Décembre (Draft, untouched) gets 950; Janvier created from Novembre gets Courses 400 (quickstart scenario 7).

### Tests for User Story 6 ⚠️

- [X] T097 [P] [US6] Write `packages/shared/test/planning/recurring.spec.ts` for `shouldPropagate({ laterMonthStatus, handEdited })`: draft + false → true; draft + true → false; active/closed → false. And `needsScope(group, changedFields)`: true only for `personal`/`recurring_shared` when `totalMinor`, shares, `splitMode`, `payerMembershipId` or `formula` change
- [X] T098 [P] [US6] Write `backend/test/planning/us6-scopes.e2e-spec.ts`: recurring amount change without `scope` → `422 scope_required`; one-off line change without scope → 200; `this_month_only` Courses 40000 → 60000 → `isException: true`, `usualTotalMinor: '40000'`; creating Janvier from Novembre copies 40000; setting it back to 40000 clears the exception; `from_this_month_on` Loyer 90000 → 95000 with Décembre Draft and Loyer untouched → Décembre Loyer 95000, Décembre revision bumped, Décembre history `cause 'propagation'`; same with Décembre's Loyer hand-edited → unchanged; with Décembre Active → unchanged; label-only change on a recurring line needs no scope and is not propagated

### Implementation for User Story 6

- [X] T099 [US6] Implement `shouldPropagate` and `needsScope` in `packages/shared/src/domain/planning/recurring.ts` so T097 passes
- [X] T100 [US6] Extend `UpdateLine` in `backend/src/planning/application/use-cases/lines.ts`: `SCOPE_REQUIRED` when `needsScope` and no scope; `this_month_only` stores the current amount fields in `usual` (if not already set) then applies the change, clearing `usual` when the new values equal it; `from_this_month_on` clears `usual` then calls `PropagateRecurring`
- [X] T101 [US6] Implement `PropagateRecurring` in `backend/src/planning/application/services/propagate-recurring.ts`: within the same transaction, for each later month of the budget with a line of the same `series_id`, lock the month, apply the same amount fields only if `shouldPropagate` (Draft and not `hand_edited`), recompute shares for that month's members (`needs_review` if a share's member is no longer contributing), bump that month's revision, record `cause 'propagation'`
- [X] T102 [US6] Create `mobile/src/features/planning/scope-sheet.ts` (native action sheet "À partir de ce mois" / "Ce mois-ci uniquement" / "Annuler") shown from `line.tsx` on save when `needsScope` is true; show an "Exception ce mois-ci (habituellement 400,00 €)" note on exception lines in `line-row.tsx`

**Checkpoint**: recurring changes behave as the household expects

---

## Phase 9: User Story 7 - Browse past months and duplicate one (Priority: P3)

**Goal**: Month list newest first with status and what's left; duplicate any past month with optional one-off lines.

**Independent Test**: Open Décembre 2025, "Utiliser comme base", with one-off lines included (quickstart scenario 9).

### Tests for User Story 7 ⚠️

- [X] T103 [P] [US7] Write `backend/test/planning/us7-browse.e2e-spec.ts`: 14 months → `GET months` returns 12 newest first + `nextCursor`, then the rest; each item has status and per-member `whatsLeftMinor`/`overrun` (Closed months from `closed_summary`, others computed, private lines included in totals); `POST months` with `source: { kind: 'month', monthStart: '2025-12-01', includeOneOff: true }` copies one-off lines too
- [X] T104 [P] [US7] Add `GET /v1/budgets/:budgetId/months` (viewer allowed) to `backend/test/authz/budget-route-cases.ts`

### Implementation for User Story 7

- [X] T105 [US7] Implement `ListMonths` in `backend/src/planning/application/use-cases/list-months.ts` (cursor on `period_start` desc, page size 12; per-member summary without loading full detail per month beyond lines + shares + incomes in batched queries) and expose `GET /budgets/:budgetId/months` in `months.controller.ts`
- [X] T106 [US7] Create `mobile/src/app/(app)/budgets/[budgetId]/months/index.tsx`: list (French label via `monthLabelFor` + `Intl`, status chip, each member's what's left with overrun badge), infinite scroll, "Nouveau mois" button; on a month, an action "Utiliser comme base pour un nouveau mois" opening `new.tsx` preselected with that month and an "Inclure les dépenses exceptionnelles" switch; link the list from the budget home

**Checkpoint**: history is browsable and reusable

---

## Phase 10: User Story 8 - Import the existing spreadsheet (Priority: P3)

**Goal**: Read .xlsx/.ods on the device, preview mappings next to the sheet's own totals, fix or skip rows, commit all months at once.

**Independent Test**: Import a 3-sheet .xlsx with a text `12,5` cell; preview shows 144,26 € (sheet) vs −6,84 € (app); cancel saves nothing; confirm creates Closed past months; .csv refused (quickstart scenario 10).

### Tests for User Story 8 ⚠️

- [X] T107 [P] [US8] Create `packages/shared/test/fixtures/build-spreadsheet.ts` generating, with SheetJS, an in-memory workbook: sheets "Septembre 2026", "Octobre 2026", "Novembre 2026", header row with "Maëlle" and "Fabien" columns, section rows "DI", "DCR", "DCE", the T004 Novembre lines (Spotify cell stored as **text** `"12,5"`), one row with amount `"douze"`, a "Total" row, a "Reste" row with Maëlle `144,26`; exported both as cell grids (`string | number | null`[][] per sheet) and as `.xlsx`/`.ods` bytes
- [X] T108 [P] [US8] Write `packages/shared/test/import/import.spec.ts` for `periodFromSheetName(name)` ("Novembre 2026", "nov. 2026", "November 2026", "11-2026" → `{ year: 2026, month: 11 }`; "Feuil1" → null) and `proposeSheetMapping(grid, members)`: member columns matched by first name (case/accent-insensitive); section detection (`DI`, `DCR`, `DCE`, "dépenses individuelles", "communes récurrentes", "exceptionnelles"); savings by keywords (PEA, PEL, assurance vie, livret, épargne); category guesses; `"12,5"` text → 1250n; `"douze"` flagged `unreadable_amount`; "Total"/"Reste" rows captured as `sheetTotals` not as lines; personal rows with amounts in one member column become that member's personal line
- [X] T109 [P] [US8] Write `backend/test/planning/us8-import.e2e-spec.ts`: `dryRun: true` for 3 months returns per-month `summary`, `status` (`closed` for past periods, `draft` for current/next), `conflict: 'exists'` when the month exists, and `issues` for a line with mismatched shares; nothing is written; commit with a conflict → `400 import_invalid`; commit without conflicts creates all months in one transaction (force a failure on the 3rd month → none created), Closed months have `closed_summary`, history `cause 'import'`; more than 36 months → 400
- [X] T110 [P] [US8] Add `POST /v1/budgets/:budgetId/imports` (forbidden for viewer) to `backend/test/authz/budget-route-cases.ts`

### Implementation for User Story 8

- [X] T111 [US8] Implement `periodFromSheetName` and `proposeSheetMapping` in `packages/shared/src/domain/import/` (`sheet-name.ts`, `mapping.ts`, `keywords.ts`, `index.ts`; amounts via `parseBoundedAmount`, accepting numeric cells as euros converted exactly from their string form) so T108 passes; export from `packages/shared/src/domain/index.ts`
- [X] T112 [US8] Implement `ImportMonths` in `backend/src/planning/application/use-cases/import-months.ts`: permission `entries.write`; validate each month's period (`budgetMonthFor`), members contributing in that month, lines through the same domain checks as `CreateLine`; `dryRun` returns `ImportPreviewResult` without writing; commit runs in one transaction, creates months (`created_from 'import'`, past → Closed with `closed_summary`, current/next → Draft), incomes and lines, records `cause 'import'`, returns `created`; any conflict/issue → `IMPORT_INVALID` with the preview; `backend/src/planning/presentation/http/imports.controller.ts`
- [X] T113 [P] [US8] Create `mobile/src/features/planning/import/read-workbook.ts`: pick a file with `expo-document-picker` (types `.xlsx`, `.ods`; anything else → error "Formats acceptés : .xlsx, .ods"), read bytes with `expo-file-system`, parse with SheetJS `read(bytes, { type: 'array' })`, return cell grids per sheet; never upload the file; test `read-workbook.test.ts` using T107 bytes
- [X] T114 [US8] Create `mobile/src/app/(app)/budgets/[budgetId]/months/import/index.tsx` (explanation, pick file, parse, run `proposeSheetMapping` per sheet) and `import/preview.tsx`: per sheet the period (editable), skip toggle (pre-skipped when `conflict: 'exists'`), rows with group/kind/category/member amounts editable, unreadable rows highlighted and blocking until fixed or skipped, "Tableur" vs "Application" totals per member with differences highlighted (from the `dryRun` response), Cancel (nothing saved) and Confirm (commit, haptic, navigate to the month list)

**Checkpoint**: spreadsheet history can be brought in safely

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Membership changes, offline, accessibility, performance, docs

- [X] T115 Write `backend/test/planning/membership-sync.e2e-spec.ts` then implement `MonthMembershipSync` in `backend/src/planning/application/services/month-membership-sync.ts` and call it from the 002 join use case (`backend/src/budgets/application/use-cases/joining.ts`) inside its transaction: in every non-Closed month where the new member is contributing, add `0` shares to shared lines, recompute equal/proportional lines, `cause 'recompute'`, bump revisions. Departures change nothing in the current month (002 FR-033); next-month copies already drop them (T066). Role change to/from viewer is treated as leave/join for months starting after the change
- [X] T116 [P] Create `mobile/src/features/planning/online.ts` wiring `expo-network` to TanStack Query `onlineManager`, and an offline banner "Hors ligne — modifications indisponibles" on the month screens that disables edit controls (spec edge case, research R17)
- [X] T117 [P] Add a performance e2e `backend/test/planning/performance.e2e-spec.ts`: a month with 80 lines × 6 members — `GET month` p95 < 300 ms over 50 calls and 304 path < 50 ms (research R19)
- [X] T118 [P] Verify no amounts or labels reach logs: add a test in `backend/test/planning/logging.e2e-spec.ts` capturing pino output during a line create/update/import and asserting it contains neither the label nor the amount string (Principle III)
- [ ] T119 Accessibility and theming pass on every new screen (`months/index.tsx`, `new.tsx`, `[monthStart]/{index,line,income,history}.tsx`, `templates.tsx`, `categories.tsx`, `import/*`): light/dark, largest font scale with 6 members, VoiceOver/TalkBack labels (overrun read as "dépassement"), 44 pt targets, no one-off colors/spacings (Principles IV, V, VIII)
- [X] T120 [P] Update `specs/002-shared-budgets/data-model.md` (note `member_income` replaced by `income_line`, see 003 research R13) and `specs/002-shared-budgets/contracts/rest-api.md` (`PUT …/income` now upserts the primary income line and returns the counted total)
- [ ] T121 Run the full gate: `pnpm -r lint`, `pnpm -r typecheck`, `pnpm --filter @two-cents/shared test`, `pnpm --filter two-cents-backend test`, `pnpm --filter two-cents-backend test:e2e`, `pnpm --filter two-cents-mobile test`; then walk through quickstart.md manual scenarios 1–12 and time scenario 6 (SC-001 < 3 min)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; blocks every story. Inside: T004 → T005–T013 (tests) → T014–T021 (implementation) → contracts T022–T027 → DB T028–T030 → T031 → backend skeleton T032–T039 → mobile plumbing T040–T045
- **US1 (Phase 3)**: after Foundational
- **US2 (Phase 4)**: after US1 (reuses `CreateMonth`, month screen)
- **US3, US4, US5**: after US1; independent of each other (US4's redaction also covers templates from US2 and history from US5 — run T084 after those if they are already merged, otherwise it covers what exists)
- **US6**: after US1 and US2 (copy uses `usual`); benefits from US5 history
- **US7**: after US2 (duplicate uses the copy source)
- **US8**: after US1 (needs `CreateLine` validation); independent of US2–US7
- **Polish**: after the stories it touches

### Within Each User Story

- Tests first and failing → shared domain → use cases → controllers → mobile screens
- Every new route is added to `backend/test/authz/budget-route-cases.ts` in the same story (the coverage suite fails otherwise)

### Parallel Opportunities

- Phase 1: T001, T002, T003 together
- Phase 2: domain tests T005–T013 together; implementations T014, T015, T017–T020 together; contracts T022–T026 together; T032, T033, T039 together; mobile T041–T045 together
- Once US1 is done: US3, US4, US5 and US8 can be worked by different people in parallel

---

## Parallel Example: User Story 1

```bash
# Tests together (they touch different files):
Task: "T046 us1-plan-month e2e in backend/test/planning/us1-plan-month.e2e-spec.ts"
Task: "T047 us1-sync-and-conflicts e2e in backend/test/planning/us1-sync-and-conflicts.e2e-spec.ts"
Task: "T048 authz cases in backend/test/authz/budget-route-cases.ts"
Task: "T049 use-case unit tests in backend/src/planning/application/use-cases/us1.spec.ts"
Task: "T050 live summary test in mobile/src/features/planning/use-live-summary.test.ts"

# Mobile components together:
Task: "T057 line-row.tsx"
Task: "T058 conflict-dialog.tsx"
```

## Parallel Example: User Story 8

```bash
Task: "T107 spreadsheet fixture builder"
Task: "T109 import e2e"
Task: "T110 authz case"
# then
Task: "T111 shared import heuristics"   # after T107/T108
Task: "T113 read-workbook.ts"           # after T107
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phases 1–2 (the calculation engine with property tests is the heart, Principle II)
2. Phase 3 (US1) → **stop and validate**: the Novembre 2026 figures on two devices, sync < 5 s
3. Phase 4 (US2) → the monthly routine replaces the spreadsheet → demo

### Incremental Delivery

1. US3 (splits & formulas) → less arithmetic
2. US4 (privacy) → both partners comfortable
3. US5 (lifecycle & history) → agreement and trust
4. US6 (scopes) → recurring changes right
5. US7 (browse) and US8 (import) → history

### Notes

- [P] = different files, no dependency on unfinished tasks
- Commit after each task or logical group, Conventional Commits with scope and issue, e.g. `feat(shared): add month summary calculation [#5]`
- Never use `number` for money; never log labels or amounts
