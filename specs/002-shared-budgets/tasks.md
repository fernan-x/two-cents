---

description: "Task list for 002-shared-budgets"
---

# Tasks: Shared Budgets & Membership

**Input**: Design documents from `/specs/002-shared-budgets/`: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/rest-api.md](./contracts/rest-api.md), [contracts/links-and-notifications.md](./contracts/links-and-notifications.md), [quickstart.md](./quickstart.md)

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. The spec requires them (FR-041, SC-002). The constitution requires domain rules to be written test-first (Principle II) and a non-member refusal test for every data route (Principle III). Write each story's test tasks first and confirm they fail before implementing.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested on its own.

**Starting point**: 001-user-accounts is implemented, so these foundations already exist and are **not** rebuilt here: the pnpm workspace, `.node-version`, `docker-compose.yml` (postgres 5442, postgres-test 5443, mailpit), Drizzle + `drizzle.config.ts` + `db:generate`/`db:migrate`, `packages/shared` (contracts + domain, tests in `packages/shared/test/`, `pickNewOwner` already in `packages/shared/src/domain/ownership.ts`), the env loader, `ZodValidationPipe`, `DomainError` + filter, `AuthGuard` (the research R4 test-only auth stub is no longer needed), `TransactionRunner` (AsyncLocalStorage, `afterCommit`), `Clock`/`IdGenerator` ports, `@nestjs/mail` module, `@nestjs/schedule`, `@nestjs/throttler`, i18next on mobile, TanStack Query, `expo-haptics`, `expo-localization`, the `twocents` scheme, and the `/i/*` entry in the iOS AASA file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US7 from spec.md)
- Each description gives exact file paths

## Path Conventions

- Shared package: `packages/shared/src/{contracts,domain}/`, tests in `packages/shared/test/*.spec.ts`
- Backend (clean architecture, same layers and ESLint import rules as 001): `backend/src/budgets/{domain,application,infrastructure,presentation}/`, shared adapters in `backend/src/shared-kernel/`. Unit tests are colocated `*.spec.ts`; e2e tests go in `backend/test/budgets/*.e2e-spec.ts`; authorization coverage goes in `backend/test/authz/`
- Mobile (Expo Router): routes go in `mobile/src/app/`, budget feature code in `mobile/src/features/budgets/`, push code in `mobile/src/notifications/`, tests colocated as `*.test.ts(x)`
- Layer rule: `domain/` imports only `@two-cents/shared/domain`; `application/` imports `domain/` plus `@nestjs/common` `Injectable`/`Inject`; `presentation/` calls use cases only; adapters live in `infrastructure/`
- Mobile rule (`mobile/AGENTS.md`): add Expo packages with `npx expo install`, and check the SDK 58 docs before using any Expo API

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New dependencies, config and doc fixes that 001 did not need

- [X] T001 Add backend dependencies in `backend/package.json`: `@nestjs/outbox` pinned to an exact version (no caret, research R9) and `expo-server-sdk`. Add `INVITE_CODE_SECRET` (min 32 chars), `APP_STORE_URL`, `PLAY_STORE_URL` and optional `EXPO_ACCESS_TOKEN` to the zod env schema in `backend/src/shared-kernel/infrastructure/config/env.ts`, to `backend/.env.example` and to `backend/test/support/test-env.ts`
- [X] T002 [P] Read `backend/node_modules/@nestjs/outbox` (README and type declarations). Confirm the real API names for `OutboxModule`, `PostgresOutboxStore`, `fromDrizzle`, `outbox.add`, `outbox.notify`, `@OnOutboxMessage`, `NonRetryableMessageError`, `OutboxInbox.prune`, `OutboxDeadLetters.purge`, `migrationSql`, and how long published messages are kept. Record confirmed names and any corrections in research R9 of `specs/002-shared-budgets/research.md`
- [X] T003 [P] Run `npx expo install expo-notifications` in `mobile/`. Add the `expo-notifications` plugin to `mobile/app.config.ts`, plus a second Android intent filter entry `{ scheme: 'https', host: linkHost, pathPrefix: '/i/' }` next to the existing `/l/` one
- [X] T004 [P] Fix the docs to match the codebase. In `specs/002-shared-budgets/quickstart.md`, the install page URL becomes `http://localhost:3000/i/<CODE>` (outside `/v1`, like 001's `/l/*`). In `specs/002-shared-budgets/contracts/rest-api.md`, note that `GET /i/:code` is served outside the `/v1` prefix. In research R4 of `specs/002-shared-budgets/research.md`, note that 001's real `AuthGuard` is used and the test stub is dropped. Add the `invite_code_failure` table (see T022) and the outbox topics `member.removed` and `budget.owner_changed` to `specs/002-shared-budgets/data-model.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure domain rules, contracts, schema, outbox, push, the access guard and test helpers. Every story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Domain tests first (Principle II): write them and see them fail

- [X] T005 [P] Write `packages/shared/test/budget-month.spec.ts` for `budgetMonthFor(localDate, rules)` and `localDateIn(instant, timeZone)`. Cases: start day 1 on 2026-11-16 → `2026-11-01..2026-11-30`; start day 28 on 2026-11-16 → `2026-10-28..2026-11-27`; year rollover (start 28 on 2027-01-05 → `2026-12-28..2027-01-27`); February with start 28; transition **1 → 28 changed 2026-11-16** → current `11-01..11-30`, transition `12-01..12-27`, then `2026-12-28..2027-01-27`; transition **28 → 1 changed 2026-11-16** → current `10-28..11-27`, transition `11-28..12-31`, then January. A loop over every (old, new) start-day pair and every month asserts each transition month lasts 15–45 days. `localDateIn` returns the Paris calendar date at 23:30 UTC and across both DST switches. Also test `planStartDayChange(rules, localToday, newStartDay)` → the new rule `{ effectiveFrom, startDay }`, where `effectiveFrom` is the day after the current month ends
- [X] T006 [P] Write `packages/shared/test/membership.spec.ts` for `isIncludedInMonth({ role, joinedOn, leftOn }, { start, end })` on local dates. Cases: a viewer is never included; joining after `end` → excluded; leaving on 2026-11-16 → included in `11-01..11-30` and excluded from `12-01..12-31`; leaving on the month's start day → included. Also cover `canInvite({ currentMembers, pendingInvitations })`: 5 → true, 6 → false. `MAX_PEOPLE` = 6
- [X] T007 [P] Write `packages/shared/test/permissions.spec.ts`: a table-driven test of `can(role, permission)` for every cell of the permission matrix in `specs/002-shared-budgets/data-model.md` (`budget.read`, `budget.settings.edit`, `budget.delete`, `budget.restore`, `invitations.manage`, `members.manage`, `ownership.transfer`, `entries.write`, `income.write.own`, `membership.leave`), plus `canManageTarget(actorRole, targetRole)`: false whenever the target is `owner`; an admin may manage another admin
- [X] T008 [P] Write `packages/shared/test/invite-code.spec.ts`. `normalizeInviteCode`: `'abc-12o'` → `'ABC120'`; `I`/`L` → `1`; spaces and dashes stripped; returns `null` when the length isn't 6 or a character falls outside the Crockford alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (e.g. `U`). `formatInviteCode('ABC120')` → `'ABC-120'`. `generateInviteCode(randomInt)` emits only alphabet characters (stub `randomInt` to check it is deterministic)
- [X] T009 [P] Write `packages/shared/test/money.spec.ts` for `parseAmount(input, currency)` → `bigint | null` in minor units. Cases: `'12,5'` and `'12.5'` → `1250n`; `'2 450,50'` with a normal space, NBSP U+00A0 and narrow NBSP U+202F → `245050n`; `'0'` → `0n`; `null` for negatives, more decimals than the currency allows, letters or an empty string; `'1200'` in JPY → `1200n` (minor digits read from `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits`)

### Domain implementation

- [X] T010 [P] Implement `budgetMonthFor`, `localDateIn` and `planStartDayChange` in `packages/shared/src/domain/budget-month.ts`. Use pure `YYYY-MM-DD` integer arithmetic plus `Intl.DateTimeFormat` for the zone conversion, with no date library (research R5). A transition month ends the day before the first occurrence of the new start day that is at least 15 days after the transition start. Make T005 pass
- [X] T011 [P] Implement `isIncludedInMonth`, `canInvite` and `MAX_PEOPLE` in `packages/shared/src/domain/membership.ts` so T006 passes
- [X] T012 [P] Implement `Role`, `Permission`, `can` and `canManageTarget` in `packages/shared/src/domain/permissions.ts` so T007 passes
- [X] T013 [P] Implement `INVITE_CODE_ALPHABET`, `normalizeInviteCode`, `formatInviteCode` and `generateInviteCode` in `packages/shared/src/domain/invite-code.ts` so T008 passes
- [X] T014 [P] Implement `parseAmount` and `minorDigits(currency)` in `packages/shared/src/domain/money.ts` so T009 passes
- [X] T015 Export the new modules from `packages/shared/src/domain/index.ts`, then run `pnpm --filter @two-cents/shared test` and `pnpm --filter @two-cents/shared build`

### Contracts (Principle VII)

- [X] T016 [P] Create `packages/shared/src/contracts/budgets.ts` with these Zod schemas and inferred types:
  - `Role`, `Money` (`amountMinor` as an integer string `/^\d+$/`), `BudgetMonth`, `PersonRef`
  - `CreateBudgetRequest`: `name` trimmed and NFC-normalized, "1–60 chars after trim"; `currency` `/^[A-Z]{3}$/`, default `'EUR'`; `monthStartDay` int "1–28", default 1; `timeZone` checked with `Intl.supportedValuesOf('timeZone')`
  - `UpdateBudgetRequest` (`name?`, `monthStartDay?`, `currency?`) and `DeleteBudgetRequest` (`confirmName`)
  - `BudgetSummary`, `BudgetDetail` (with `pendingMonthStartDay` and `myIncomeMissing`), `DeletedBudget` (`deletedAt`, `purgeAt`), `MyBudgetsResponse`

  All shapes are exactly as in `contracts/rest-api.md`
- [X] T017 [P] Create `packages/shared/src/contracts/members.ts`: `MemberView` (with `currentMonthIncome: Money | null`), `MembersResponse` (`members`, `formerMembers: PersonRef[]`), `ChangeRoleRequest` (`role: 'admin' | 'member' | 'viewer'`), `TransferOwnershipRequest`, and `MembershipEvent` (types exactly as the data-model `membership_event.type` enum) plus `EventsResponse` (`nextCursor`)
- [X] T018 [P] Create `packages/shared/src/contracts/invitations.ts`: `CreateInvitationRequest`, a discriminated union on `kind` (`{ kind: 'email', email, role? }` | `{ kind: 'code', role? }`, where `role` is `'admin' | 'member' | 'viewer'`, default `'member'`); `InvitationView`, `CreatedInvitation` (`code` formatted `ABC-123`, `link`), `InvitationsQuery` (`status=pending|all`), `InvitationPreview`, `AcceptInvitationResponse` (`budgetId`, `role`, `askIncome`, `currentMonth`) and `InvitationGoneError` (`invitation_expired | invitation_revoked | invitation_declined | invitation_used`, `inviterName`)
- [X] T019 [P] Create `packages/shared/src/contracts/income.ts` (`PutIncomeRequest { amountMinor }`, `monthStart` param `YYYY-MM-DD`) and `packages/shared/src/contracts/push.ts` (`PutPushDeviceRequest { expoPushToken, platform: 'ios' | 'android' }`)
- [X] T020 [P] Create `packages/shared/src/contracts/outbox.ts` with typed payloads for the topics `invitation.sent`, `budget.deleted`, `budget.restored`, `member.removed` and `budget.owner_changed`. Fields come from the data-model "Outbox messages" table and never include an amount
- [X] T021 Add the error codes `budget_not_found`, `forbidden`, `stale_state`, `currency_locked`, `confirm_name_mismatch`, `cannot_modify_owner`, `owner_must_transfer`, `already_member`, `budget_full`, `invitation_not_found`, `invitation_wrong_email`, `invitation_expired`, `invitation_revoked`, `invitation_declined`, `invitation_used`, `invalid_amount` and `invalid_month` to `packages/shared/src/contracts/errors.ts`. Export the new contract files from `packages/shared/src/contracts/index.ts` and rebuild the package

### Database

- [X] T022 Create the Drizzle schema in `backend/src/shared-kernel/infrastructure/db/schema/budgets.ts` and export it from `schema/index.ts`. Copy every constraint from `data-model.md` exactly:
  - `budget`: name "1–60 chars after trim", `currency char(3)`, `time_zone`, `deleted_at`/`deleted_by` nullable, partial index `(deleted_at) WHERE deleted_at IS NOT NULL`
  - `budget_month_start_rule`: PK `(budget_id, effective_from)`, `start_day smallint` with "CHECK 1–28", `ON DELETE CASCADE`
  - `membership`: `user_id` `ON DELETE SET NULL`, `display_name_snapshot`, role enum `owner|admin|member|viewer`, `left_reason` enum `left|removed|account_deleted`, `last_opened_at`. Constraints: `UNIQUE (budget_id) WHERE role='owner' AND left_at IS NULL`, `UNIQUE (budget_id, user_id) WHERE left_at IS NULL`, `CHECK (role <> 'owner' OR left_at IS NULL)`
  - `member_income`: PK `(membership_id, month_start)`, `amount_minor bigint` "≥ 0" check, `currency char(3)`, `updated_at`, `updated_by`
  - `invitation`: kind enum `email|code`, role enum `admin|member|viewer` default `member`, `code_hash bytea`, `invited_by` `ON DELETE SET NULL`, `inviter_name_snapshot`, status enum `pending|accepted|declined|revoked|expired`, `last_sent_at`, `expires_at`, `send_count`, `resolved_at`/`resolved_by`. Constraints: `UNIQUE (budget_id, email_normalized) WHERE status='pending' AND kind='email'`, `UNIQUE (code_hash) WHERE status='pending'`, `CHECK (kind='code' OR email_normalized IS NOT NULL)`
  - `membership_event`: type enum from the data model, `details jsonb`
  - `push_device`: `session_id` references 001's session table `ON DELETE CASCADE`, `expo_push_token` unique, platform enum `ios|android`
  - `invite_code_failure`: `user_id` → user cascade, `failed_at`, index `(user_id, failed_at)`
- [X] T023 Run `pnpm --filter two-cents-backend db:generate`, rename the output to `backend/drizzle/0002_budgets.sql`, and check that it contains every partial unique index and CHECK from T022. Then add a custom migration (`drizzle-kit generate --custom`) `backend/drizzle/0003_nest_outbox.sql` holding `PostgresOutboxStore.migrationSql({ statementBreakpoints: true })` (research R9). Run `db:migrate` against both compose databases
- [X] T024 Extend `truncateAll` in `backend/test/support/database.ts` to clear the new tables and the `nest_outbox` tables

### Outbox, push and jobs (shared kernel)

- [X] T025 Add an `EventPublisher` port (`publish<T extends OutboxTopic>(topic, payload)`, symbol `EVENT_PUBLISHER`) and a `PushSender` port (`send(messages: { to: string[]; title; body; data? }[])`, symbol `PUSH_SENDER`) to `backend/src/shared-kernel/application/ports.ts`
- [X] T026 Create `backend/src/shared-kernel/infrastructure/outbox/outbox.module.ts`: `PostgresOutboxStore` via `fromDrizzle(db)` with `migrate: false`, using the API names confirmed in T002. Create `outbox-event-publisher.ts`, which calls `outbox.add(currentTx, { topic, payload })` with the transaction from the `DrizzleTransactionRunner` AsyncLocalStorage and calls `outbox.notify()` in `afterCommit`. Register the module in `backend/src/app.module.ts`
- [X] T027 [P] Create `backend/src/shared-kernel/infrastructure/push/expo-push-sender.ts` (`expo-server-sdk`: chunked sends; log ticket errors without tokens; delete `push_device` rows on `DeviceNotRegistered`) and `push.module.ts` binding `PUSH_SENDER`
- [X] T028 [P] Extract the advisory-lock pattern from `backend/src/identity/infrastructure/jobs/finalize-deletions.job.ts` into `backend/src/shared-kernel/infrastructure/db/advisory-lock.ts` (`withAdvisoryLock(key, work)` on a dedicated connection) and switch that job to use it
- [X] T029 [P] Create `backend/src/shared-kernel/infrastructure/outbox/outbox-retention.job.ts`: a daily job under `withAdvisoryLock` that prunes the inbox at 30 days, purges handled dead letters older than 14 days, and purges published messages older than 30 days if T002 showed the package keeps them (research R9)
- [X] T030 Update `backend/test/support/e2e-app.ts`:
  - override `PUSH_SENDER` with an in-memory sender exposed as `e2e.pushes`
  - override `CLOCK` with a settable `FixedClock` exposed as `e2e.clock` (default: real time)
  - add `e2e.drainOutbox()`, which runs the outbox relay until it is empty so tests can assert on mails and pushes synchronously

### Budgets module skeleton and access control (FR-039 to FR-041)

- [X] T031 Create the module skeleton:
  - `backend/src/budgets/budgets.module.ts`, imported in `backend/src/app.module.ts` (it imports `IdentityModule` for `AuthGuard`)
  - `backend/src/budgets/domain/ports/repositories.ts` with port interfaces and symbols: `BudgetRepository`, `MembershipRepository`, `InvitationRepository`, `IncomeRepository`, `MembershipEventLog`, `PushDeviceRepository`, `InviteCodeFailureLog`
  - `backend/src/budgets/application/ports.ts` with `InviteCodeHasher` and `BudgetLock` (`lockBudget(budgetId)` = `SELECT … FOR UPDATE` within the current transaction)
- [ ] T032 [P] Create in-memory fakes for every port in `backend/src/budgets/application/testing/fakes.ts`, and a `buildBudgets()` helper in `backend/src/budgets/application/testing/build.ts` that wires use cases with the fakes and a fixed clock (same pattern as `backend/src/identity/application/testing/`)
- [X] T033 Create `backend/src/budgets/presentation/http/require-permission.decorator.ts` (`@RequirePermission(permission)`) and `budget-access.guard.ts`. The guard:
  - reads `:budgetId`; a value that isn't a UUID → 404
  - loads the caller's current membership (`left_at IS NULL`) on a non-deleted budget; none → `404 budget_not_found`, the same body as for an unknown id (FR-040)
  - checks `can(role, permission)` → `403 forbidden`
  - attaches the membership to the request
  - **fails closed**: throws on a route that has no `@RequirePermission`

  Also add `current-membership.decorator.ts`. Controllers use `@UseGuards(AuthGuard, BudgetAccessGuard)`
- [X] T034 Create the SC-002 authorization coverage suite:
  - `backend/test/authz/budget-route-cases.ts`: a registry keyed `"METHOD /v1/budgets/:budgetId/..."` → `{ write: boolean; body?: unknown }`
  - `backend/test/authz/route-coverage.e2e-spec.ts`: lists every Express route whose path contains `:budgetId` and **fails if any route is missing from the registry**. For each route it asserts: a signed-in non-member gets 404 with a body identical to a random UUID's; a deleted budget gives 404; when `write` is true, a viewer gets 403. The registry starts empty; each story adds its routes
- [X] T035 [P] Create `backend/test/support/users.ts` (`signUpConfirmed(e2e, { email, firstName })` → `{ userId, token, sessionId }`, signing up through `/v1/auth/signup` and confirming via the mailbox link) and `backend/test/support/budgets.ts` (`createBudget(e2e, token, body?)`, and `seedMember(db, { budgetId, userId, role, joinedAt? })` to insert memberships directly so later stories don't depend on the invitation flow)

### Mobile foundation

- [X] T036 [P] Create `mobile/src/features/budgets/query-keys.ts` (`budgetKeys.mine`, `budgetKeys.detail(id)`, `budgetKeys.members(id)`, `budgetKeys.invitations(id)`, `budgetKeys.events(id)`) and `mobile/src/features/budgets/use-can.ts` (`useCan(budgetId, permission)` from `can` in `@two-cents/shared/domain` and the cached `myRole`)
- [X] T037 [P] Add a role label helper, `mobile/src/features/budgets/role-label.ts`, returning text labels (Propriétaire, Admin, Membre, Lecteur), never color alone (Principle VIII), plus a `budgets` namespace with those keys in `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json`

**Checkpoint**: Domain tests pass, the schema is migrated, and the guard and coverage suite are in place. User story work can begin.

---

## Phase 3: User Story 1 - Create a budget (Priority: P1) 🎯 MVP

**Goal**: A signed-in user creates a budget (name, currency, month start day), becomes its owner, and lands in it.

**Independent Test**: Sign in, create a budget with the defaults, and confirm it opens with the creator as owner and the current budget month computed from the start day (quickstart scenario 1).

### Tests for User Story 1 ⚠️

- [X] T038 [P] [US1] Write `backend/src/budgets/domain/entities/budget.spec.ts` covering:
  - `BudgetName`: trims, NFC-normalizes, refuses empty, whitespace-only and over-60-char names with `invalid_budget_name`
  - `MonthStartDay`: 1–28 only
  - `Budget.create`: one owner membership plus one start rule whose `effectiveFrom` is the creation month start in the budget time zone
- [ ] T039 [P] [US1] Write `backend/src/budgets/application/use-cases/us1.spec.ts` (using `buildBudgets()`): creating a budget stores the budget, the owner membership, the start rule and a `budget_created` event; the `currency` default is `EUR`; `getBudget` with the clock at 2026-11-16 and start day 28 returns `currentMonth` `2026-10-28..2026-11-27`; `listMyBudgets` returns both budgets of a user with two
- [X] T040 [P] [US1] Write `backend/test/budgets/create.e2e-spec.ts` covering:
  - `POST /v1/budgets` → 201 `BudgetDetail` with `myRole: 'owner'` and one member
  - `monthStartDay: 28` with `e2e.clock` at 2026-11-16 → `currentMonth` 2026-10-28..2026-11-27
  - `name: '   '` → 400
  - a second budget "Chatterie" → `GET /v1/me/budgets` lists both
  - `GET /v1/budgets/:id` → 200
  - `GET /v1/me` → `hasBudget: true`

### Implementation for User Story 1

- [X] T041 [P] [US1] Implement the value objects `backend/src/budgets/domain/value-objects/{budget-name,month-start-day,currency}.ts` and the entities `backend/src/budgets/domain/entities/{budget,membership}.ts` so T038 passes
- [X] T042 [US1] Implement the use cases `backend/src/budgets/application/use-cases/{create-budget,get-budget,list-my-budgets}.ts`. `get-budget` assembles `BudgetDetail`: `currentMonth` comes from `budgetMonthFor(localDateIn(clock.now(), timeZone), rules)`, and `pendingMonthStartDay` from a rule with `effectiveFrom` > today. `myIncomeMissing` is true when the caller isn't a viewer and has no `member_income` for `currentMonth.start`. `MemberView.color` is derived deterministically from `membershipId`. Make T039 pass
- [X] T043 [US1] Implement the Drizzle adapters `backend/src/budgets/infrastructure/persistence/{drizzle-budget.repository,drizzle-membership.repository,drizzle-membership-event-log,drizzle-budget-lock}.ts` with mappers, and bind them in `budgets.module.ts`
- [X] T044 [US1] Implement `backend/src/budgets/presentation/http/budgets.controller.ts` (`POST /budgets` with `AuthGuard` only; `GET /budgets/:budgetId` with `@RequirePermission('budget.read')`) and `my-budgets.controller.ts` (`GET /me/budgets`, sorted by `lastOpenedAt` desc then `joinedAt` desc, `recentlyDeleted: []` for now). Add `GET /v1/budgets/:budgetId` (`write: false`) to `backend/test/authz/budget-route-cases.ts`
- [X] T045 [US1] Implement `hasAnyBudget` for 001:
  - create `backend/src/budgets/infrastructure/identity-ports/budget-identity-ports.module.ts`, which depends only on `DbModule` to avoid a cycle with `IdentityModule`
  - add `budget-membership.adapter.ts` with a real `hasAnyBudget` (current membership on a non-deleted budget); the other methods delegate to `NoopBudgetPorts` until T116
  - bind `BUDGET_MEMBERSHIP_PORT` to it in `backend/src/identity/identity.module.ts`

  Make T040 pass
- [X] T046 [P] [US1] Create `mobile/src/features/budgets/api.ts` with typed calls for `createBudget`, `getBudget` and `getMyBudgets` through `mobile/src/auth/api-client.ts`, parsing responses with the contract schemas
- [X] T047 [US1] Create `mobile/src/app/(app)/budgets/new.tsx`:
  - name field with a 60-char limit and an error for blank names
  - currency prefilled from the 001 profile currency
  - month start day picker 1–28 with a live preview "Mois en cours : 28 oct. – 27 nov." from `budgetMonthFor`
  - `timeZone` from `expo-localization` `getCalendars()[0].timeZone`

  On success: invalidate `me` and `budgetKeys.mine`, then `router.replace` to the new budget (SC-004: under 30 s)
- [X] T048 [US1] Create `mobile/src/app/(app)/budgets/[budgetId]/index.tsx` (budget home): the budget name, the current month dates formatted with the device locale, and the member list with avatar, name and a text role label from `role-label.ts`. Register the screens in `mobile/src/app/(app)/_layout.tsx`
- [X] T049 [US1] Make the US1 entry points work: in `mobile/src/app/(app)/onboarding/choose.tsx`, enable "Créer un budget" (→ `/budgets/new`) and drop the `comingSoon` text; "Rejoindre avec un code" stays disabled until T075. In `mobile/src/app/(app)/index.tsx`, redirect to the first budget from `GET /me/budgets`, or to onboarding when there is none. Add the fr and en strings in `mobile/src/i18n/*.json`

**Checkpoint**: A single user can create budgets and open them: a usable MVP.

---

## Phase 4: User Story 2 - Invite the partner and have them join (Priority: P1)

**Goal**: The owner or an Admin invites by email or by code. The invitee opens the link, signs up if needed, accepts or declines, and enters (or skips) their income.

**Independent Test**: From an owner account, invite by email. On a fresh device, open the link, sign up, accept, enter income, and confirm both accounts see the same budget and both incomes (quickstart scenarios 2–5).

### Tests for User Story 2 ⚠️

- [X] T050 [P] [US2] Write `backend/src/budgets/domain/entities/invitation.spec.ts` covering:
  - `Invitation.createEmail` / `createCode`: `expires_at = last_sent_at + 7 days`, status `pending`, `send_count` 1
  - `isEffectivelyPending(now)` is false once `expires_at` has passed
  - `accept` / `decline` only from `pending`
  - `goneReason()` maps the status to `invitation_expired | invitation_revoked | invitation_declined | invitation_used`
  - `MemberIncome` refuses negative amounts and a currency other than the budget's
- [ ] T051 [P] [US2] Write `backend/src/budgets/application/use-cases/us2.spec.ts` covering:
  - an email invite stores only the HMAC of the code and publishes `invitation.sent` (no amount in the payload)
  - inviting a current member's email → `already_member` (FR-013)
  - inviting an email with a pending invitation → resends the same invitation (`send_count` 2, `expires_at` reset, 200 instead of 201; FR-014)
  - 6 people (members + effectively pending) → `budget_full` (FR-023)
  - accepting an email invitation with another account's email → `invitation_wrong_email` with a masked email (reuse `maskEmail` from 001)
  - a code invitation is accepted by any confirmed user
  - a current member opening the code → `already_member` and the code isn't consumed
  - a viewer accepts → `askIncome: false`
  - a former member rejoins → a new membership row with the same `user_id`
  - declining → status `declined`
  - an unconfirmed email → `email_not_confirmed`
  - recording income for a month the member wasn't included in → `invalid_month`
- [X] T052 [P] [US2] Write `backend/test/budgets/invitations.e2e-spec.ts` covering:
  - an email invite → after `drainOutbox()`, Mailpit capture has one French email with an `/i/` link, the code formatted `XXX-XXX`, the budget name, and no digits next to a currency sign
  - inviting an email whose account has a registered push device → one push titled "Invitation de {inviter}" with `data.url = '/i/<CODE>'`
  - a code invite returns `code` and `link`
  - two concurrent `POST /v1/invitations/:code/accept` calls → exactly one 200 and one `410 invitation_used`
  - a 6th lookup failure within 15 min for one account → 429 with `retryAfterSeconds`
  - accept → `GET /v1/budgets/:id` works for the invitee
  - decline → owner sees status `declined`
- [X] T053 [P] [US2] Write `backend/test/budgets/income.e2e-spec.ts` covering:
  - `PUT /v1/budgets/:id/members/me/income/:monthStart` with `'245050'` → 200; every member (viewer included) sees it in `currentMonthIncome`
  - `myIncomeMissing` flips from true to false
  - a non-integer string → 400
  - a future month → `400 invalid_month`
  - a viewer → 403
- [X] T054 [P] [US2] Write `backend/test/budgets/install-page.e2e-spec.ts`: `GET /i/ABC-123` (no `/v1`) → 200 HTML containing `ABC-123` and the store links, with **no** budget name or inviter name; the 31st request from one IP within an hour → 429
- [X] T055 [P] [US2] Write `mobile/src/features/budgets/pending-invite.test.ts` (a code saved while signed out survives into sign-in and is cleared after use) and `mobile/src/app/(app)/budgets/[budgetId]/income.test.tsx` (React Native Testing Library: `2 450,50` submits `amountMinor: '245050'`, the visibility notice is shown, Skip navigates to the budget)

### Implementation for User Story 2

- [X] T056 [P] [US2] Implement `backend/src/budgets/domain/entities/{invitation,member-income}.ts` and `backend/src/budgets/domain/value-objects/invitation-role.ts` so T050 passes
- [X] T057 [P] [US2] Implement `backend/src/budgets/infrastructure/security/hmac-invite-code-hasher.ts`: HMAC-SHA256 of the normalized code with `INVITE_CODE_SECRET`; generation uses `generateInviteCode(crypto.randomInt)`
- [X] T058 [US2] Implement `backend/src/budgets/application/use-cases/create-invitation.ts`. In one transaction: `BudgetLock.lockBudget`, then the already-member check, then the pending-email resend path (FR-014), then `canInvite`, then insert, then `invitation_sent` event, then `EventPublisher.publish('invitation.sent', …)` with the link `${APP_LINK_BASE_URL}/i/<CODE>`. Store `inviter_name_snapshot`. Require a confirmed email
- [X] T059 [US2] Implement `backend/src/budgets/application/use-cases/{preview-invitation,accept-invitation,decline-invitation}.ts`. Resolution order: lookup by code hash (miss → record an `invite_code_failure` and throw `invitation_not_found`, with a lockout check first, 5 per 15 min like `packages/shared/src/domain/lockout.ts`); gone status or expiry → 410 with `inviterName`; email mismatch → `invitation_wrong_email`; current member → `already_member`. Accept runs `acceptIfPending` (conditional `UPDATE … WHERE status='pending'`, zero rows → `invitation_used`) plus a new membership plus a `joined` event, all under the budget lock. It returns `askIncome = role !== 'viewer'` and `currentMonth`. Make T051 pass
- [X] T060 [US2] Implement `backend/src/budgets/application/use-cases/record-income.ts`. `monthStart` must equal the start of a budget month from `budgetMonthFor`, be the current or a past month, and the member must be `isIncludedInMonth` → else `invalid_month`. Upsert `member_income` with `updated_by`/`updated_at` and the budget currency
- [X] T061 [US2] Implement the Drizzle adapters `backend/src/budgets/infrastructure/persistence/{drizzle-invitation.repository,drizzle-income.repository,drizzle-invite-code-failure-log,drizzle-push-device.repository}.ts`. Every read filters "effectively pending" as `status='pending' AND expires_at > now()`. `acceptIfPending` checks the affected row count
- [X] T062 [US2] Implement `backend/src/budgets/presentation/http/invitations.controller.ts` with `POST /budgets/:budgetId/invitations` (`invitations.manage`; 201 for new, 200 for a resend), and `invitee-invitations.controller.ts` with `GET /invitations/:code`, `POST /invitations/:code/accept` and `POST /invitations/:code/decline` (`AuthGuard`; the code param normalized with `normalizeInviteCode`, an invalid format counting as a failure). Add the invitation POST route (`write: true`, with a valid body) to the authz registry
- [X] T063 [US2] Implement `backend/src/budgets/presentation/http/income.controller.ts` (`PUT /budgets/:budgetId/members/me/income/:monthStart`, `income.write.own`), include `currentMonthIncome` in `MemberView` from `get-budget`, and add the route (`write: true`) to the authz registry. Make T053 pass
- [X] T064 [US2] Implement `backend/src/budgets/presentation/http/push-devices.controller.ts` (`PUT /me/push-devices` upserts on the current session; `DELETE /me/push-devices/current`)
- [X] T065 [US2] Implement `backend/src/budgets/infrastructure/notifications/invitation-mail.ts`: a `Mailable` following `backend/src/identity/infrastructure/mail/identity.mailable.ts`, with French and English templates holding the inviter first name, budget name, role, button to `/i/<CODE>`, code in large type and expiry date, and no amounts. Add `invitation-sent.handler.ts` (`@OnOutboxMessage('invitation.sent')`): send the mail with `idempotencyKey: message.id`, rethrowing a permanent `MailError` as non-retryable; if the email belongs to an account, push to its devices. A push failure never skips the email. Make T052 pass
- [X] T066 [US2] Implement `backend/src/budgets/presentation/http/invite-page.controller.ts`: `GET /i/:code` outside `/v1` (add `'i/{*path}'` to the `setGlobalPrefix` exclude list in `backend/src/shared-kernel/infrastructure/http/configure-app.ts`). It serves a minimal French HTML page with App Store and Play Store buttons and the formatted code. It never reads the database and never shows budget or inviter data. Use `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and throttle 30 per hour per IP. Make T054 pass
- [X] T067 [P] [US2] Create `mobile/src/features/budgets/pending-invite.ts`: hold the code in memory and in `expo-secure-store` while signed out, with `take()` and `clear()`. Make the first part of T055 pass
- [X] T068 [P] [US2] Create `mobile/src/notifications/push-registration.ts`, run after sign-in when permission is already granted, and after the first budget create or join (ask permission then): get the Expo push token and call `PUT /me/push-devices`; call `DELETE /me/push-devices/current` before sign-out. Also create `mobile/src/notifications/use-notification-links.ts`, which opens `data.url` from a tapped notification through `router.push`. Wire both in `mobile/src/app/_layout.tsx`
- [X] T069 [US2] Add the invitation calls (`createInvitation`, `previewInvitation`, `acceptInvitation`, `declineInvitation`, `putIncome`) to `mobile/src/features/budgets/api.ts`
- [X] T070 [US2] Create `mobile/src/app/i/[code].tsx`, registered outside `Stack.Protected` in `mobile/src/app/_layout.tsx`:
  - signed out: save the code to `pending-invite` and redirect to welcome
  - signed in: preview showing the budget name, "Invité par {inviter}", the role and the member count, with Accepter / Refuser buttons (haptics)
  - specific screens for each 410 reason ("Cette invitation a expiré — demandez-en une nouvelle à {inviter}"), for `invitation_wrong_email` ("envoyée à m•••@example.com" plus advice to ask for a code), and for `already_member` (button to open the budget)
  - after accept: invalidate `me` and `budgetKeys.mine`, then go to the income screen if `askIncome`, else to the budget
- [X] T071 [US2] Make `mobile/src/app/(app)/index.tsx` route to `/i/<code>` first when `pending-invite` holds a code (FR-015: no need to reopen the link after sign-up or sign-in)
- [X] T072 [US2] Create `mobile/src/app/(app)/onboarding/join-code.tsx`:
  - a 6-character input normalized with `normalizeInviteCode` and shown as `ABC-123`
  - submit → `/i/<code>`
  - "Passer" → `/onboarding/choose`
  - the title is "Vous avez un code d'invitation ?" when opened right after sign-up and "Rejoindre un budget" otherwise
- [X] T073 [US2] Add the FR-016a prompt: mark a just-signed-up session in `mobile/src/auth/auth-store.tsx` (set on the sign-up success path in `mobile/src/app/(auth)/sign-up.tsx` and on the first provider sign-in that created an account). `mobile/src/app/(app)/index.tsx` then sends a new user with no budget and no pending code to `/onboarding/join-code?afterSignUp=1`
- [X] T074 [US2] Create `mobile/src/app/(app)/budgets/[budgetId]/members/index.tsx` (the current members list and an "Inviter" button shown when `useCan('invitations.manage')`) and `members/invite.tsx`:
  - email or code choice, role picker (Membre by default, Admin, Lecteur)
  - for a code: show the code and link with a Share button (`Share.share` from React Native)
  - errors `already_member` and `budget_full` shown with the 6-person explanation
  - an email invite that resent an existing one says so
- [X] T075 [US2] Enable "Rejoindre avec un code" in `mobile/src/app/(app)/onboarding/choose.tsx` (→ `/onboarding/join-code`)
- [X] T076 [US2] Create `mobile/src/app/(app)/budgets/[budgetId]/income.tsx`:
  - amount input parsed with `parseAmount(input, currency)`
  - a notice that every person in the budget, Viewers included, sees this amount (FR-025a)
  - "Passer"
  - submit `PUT …/members/me/income/<currentMonth.start>`

  Add a non-blocking reminder banner to the budget home (`[budgetId]/index.tsx`) when `myIncomeMissing` is true (FR-025). Make the second part of T055 pass
- [X] T077 [US2] Add every US2 French and English string (invitation, errors, income, push permission) to `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json`

**Checkpoint**: Two people share a budget, so the P1 scope is complete. Time quickstart scenario 2 (SC-001: under 2 minutes).

---

## Phase 5: User Story 3 - Switch between budgets (Priority: P2)

**Goal**: A picker lists the user's budgets with their role. The app reopens on the last budget used, on any device.

**Independent Test**: Belong to two budgets, switch to the second, restart the app (and sign in on a second device), and confirm it opens on the second (quickstart scenario 9).

### Tests for User Story 3 ⚠️

- [X] T078 [P] [US3] Write `backend/test/budgets/picker.e2e-spec.ts` covering:
  - `POST /v1/budgets/:id/open` → 204, then `GET /v1/me/budgets` lists that budget first, from a second session of the same user too
  - a budget the user left, or one deleted, is no longer listed
  - `myRole` is correct for each budget
- [X] T079 [P] [US3] Write `mobile/src/features/budgets/active-budget.test.ts` for `pickActiveBudget(budgets)`: most recent `lastOpenedAt` first; when the last one disappears, the next one; an empty list → `null` (onboarding)

### Implementation for User Story 3

- [X] T080 [US3] Implement `backend/src/budgets/application/use-cases/open-budget.ts` (sets `membership.last_opened_at = now`) and `POST /budgets/:budgetId/open` (`budget.read`, so viewers can open) in `budgets.controller.ts`. Add it to the authz registry (`write: false`; it changes only the caller's own membership)
- [X] T081 [P] [US3] Implement `pickActiveBudget` and the `useActiveBudget()` hook in `mobile/src/features/budgets/active-budget.ts` so T079 passes. Use it in `mobile/src/app/(app)/index.tsx`
- [X] T082 [US3] Create `mobile/src/app/(app)/budgets/picker.tsx` as a form sheet (`presentation: 'formSheet'` in `(app)/_layout.tsx`):
  - each budget shows its name (wraps, never truncated, 60 chars max), the text role label and a checkmark plus "actif" for the current one
  - actions "Créer un budget" and "Rejoindre avec un code"
  - picking a budget calls `open`, then `router.replace` to it

  Add a header button on the budget home that opens the picker (2 taps to switch, SC-005)
- [X] T083 [US3] Make switching instant (SC-005: under 1 s). Prefetch `getBudget` for every budget in `GET /me/budgets` into the TanStack Query cache, render the budget home from the cache, then refetch. Call `open` when the budget home gains focus

---

## Phase 6: User Story 4 - Manage pending invitations (Priority: P2)

**Goal**: The owner and Admins see every pending invitation and can resend or revoke each one.

**Independent Test**: Send two invitations, resend one, revoke the other, and confirm the revoked link says "n'est plus valide" and the resent one has a new expiry (quickstart scenario 6).

### Tests for User Story 4 ⚠️

- [ ] T084 [P] [US4] Write `backend/src/budgets/application/use-cases/us4.spec.ts` covering:
  - resending an email invitation keeps the same code hash, resets `expires_at`, increments `send_count` and republishes `invitation.sent`
  - resending a code invitation issues a new code and the old hash no longer resolves
  - revoke → `revoked` with `resolved_by`
  - resend or revoke on a non-pending invitation → `stale_state`
  - the expire job turns `pending` with `expires_at < now` into `expired`
- [X] T085 [P] [US4] Write `backend/test/budgets/pending-invitations.e2e-spec.ts` covering:
  - `GET /v1/budgets/:id/invitations` → each pending invitation with email or `null` (code), role, `lastSentAt`, `expiresAt`, `invitedBy`
  - `?status=all` includes declined, revoked and accepted ones
  - resend → a second email in the mailbox
  - revoke → `GET /v1/invitations/:code` → `410 invitation_revoked`
  - an invitation past `expires_at` (move `e2e.clock` forward 8 days) → `410 invitation_expired` with `inviterName`
  - a member → 403

### Implementation for User Story 4

- [X] T086 [US4] Implement `backend/src/budgets/application/use-cases/{list-invitations,resend-invitation,revoke-invitation}.ts` (resend and revoke under the budget lock, events `invitation_sent` and `invitation_revoked`). Make T084 pass
- [X] T087 [US4] Add `GET /budgets/:budgetId/invitations`, `POST /budgets/:budgetId/invitations/:invitationId/resend` and `DELETE /budgets/:budgetId/invitations/:invitationId` (all `invitations.manage`) to `invitations.controller.ts`. Register them in the authz registry (GET `write: false`, but non-members still get 404; the others `write: true`). Make T085 pass
- [X] T088 [P] [US4] Implement `backend/src/budgets/infrastructure/jobs/expire-invitations.job.ts`: every 15 minutes under `withAdvisoryLock`, calling an `expire-invitations` use case
- [X] T089 [US4] Add a "Invitations en attente" section to `mobile/src/app/(app)/budgets/[budgetId]/members/index.tsx`, visible with `useCan('invitations.manage')`. Each row shows the email or "Invitation par code", the role, "envoyée le …" and "expire le …", with Renvoyer (shows the new code for code invitations) and Révoquer (confirmation) actions. Add the API calls to `mobile/src/features/budgets/api.ts` and the strings to the i18n files

---

## Phase 7: User Story 5 - Manage members, roles and ownership (Priority: P2)

**Goal**: The owner and Admins change roles and remove people; only the owner transfers ownership; any non-owner can leave; former members stay in history.

**Independent Test**: With three people, make one an Admin and one a Viewer; the Admin removes the Viewer; the owner transfers ownership to the Admin. Check roles, permissions and the "ancien membre" labels (quickstart scenarios 7–8).

### Tests for User Story 5 ⚠️

- [X] T090 [P] [US5] Write `backend/src/budgets/domain/entities/membership.spec.ts` covering:
  - `changeRole` among admin, member and viewer
  - an owner can't be changed or removed (`cannot_modify_owner`)
  - `leave` as owner → `owner_must_transfer`
  - `end(reason)` sets `left_at`, `left_reason` and `display_name_snapshot`
  - `transferOwnership` makes the previous owner `admin` and the target `owner`
  - acting on an ended membership → `stale_state`
- [ ] T091 [P] [US5] Write `backend/src/budgets/application/use-cases/us5.spec.ts` covering:
  - an admin promotes a member to admin
  - an admin removes another admin
  - an admin can't touch the owner
  - transfer runs in one transaction and emits `ownership_transferred`
  - each action writes a `membership_event` with actor, target and `{ fromRole, toRole }` and nothing else
  - remove publishes `member.removed`
  - `listMonthParticipants(budgetId, monthStart)` (with `isIncludedInMonth`) keeps someone who left on 2026-11-16 in November and drops them from December
- [X] T092 [P] [US5] Write `backend/test/budgets/members.e2e-spec.ts` covering:
  - `PATCH /v1/budgets/:id/members/:mid` → 200 with the new role
  - `DELETE` → 204, and the removed user gets 404 on the budget immediately (FR-031)
  - an admin `PATCH`ing the owner → `403 cannot_modify_owner`
  - `POST /ownership` as an admin → 403; as the owner → the previous owner becomes admin with exactly one owner
  - `POST /leave` as owner → `409 owner_must_transfer`; as a member → 204
  - `GET /members` → the departed person is in `formerMembers` with their name and `formerMember: true`
  - concurrent transfer-to-X and remove-X → one succeeds, the other gets `409 stale_state`
  - `GET /events` → visible to owner and admins, 403 to a member

### Implementation for User Story 5

- [X] T093 [US5] Extend `backend/src/budgets/domain/entities/membership.ts` with `changeRole`, `end`, `transferOwnershipTo` and the guard rules (use `canManageTarget` from the shared domain) so T090 passes
- [X] T094 [US5] Implement `backend/src/budgets/application/use-cases/{change-role,remove-member,leave-budget,transfer-ownership,list-members,list-events,month-participants}.ts`. Every mutation locks the budget, reloads the target and throws `stale_state` (with the current `MemberView`) if it ended or changed. Transfer updates both rows in one transaction, demoting the owner first so the partial unique index holds. Make T091 pass
- [X] T095 [US5] Implement `backend/src/budgets/presentation/http/members.controller.ts` with:
  - `GET /budgets/:budgetId/members` (`budget.read`)
  - `PATCH` and `DELETE /budgets/:budgetId/members/:membershipId` (`members.manage`)
  - `POST /budgets/:budgetId/ownership` (`ownership.transfer`)
  - `POST /budgets/:budgetId/leave` (`membership.leave`; the owner reaching it gets `409 owner_must_transfer`, because the matrix gives owners no leave permission, so allow the owner through the guard and refuse in the use case)
  - `GET /budgets/:budgetId/events` (`members.manage`, cursor = last event id)

  Register every route in the authz registry. Make T092 pass
- [X] T096 [P] [US5] Implement `backend/src/budgets/infrastructure/notifications/member-removed.handler.ts`: a push "Vous avez été retiré de « {budget} »" to the removed person, with no `data.url`
- [X] T097 [US5] Handle loss of access on mobile (FR-031, US5 scenario 6). In `mobile/src/features/budgets/use-budget-access.ts`, a `404 budget_not_found` from any budget query removes that budget's cache, invalidates `budgetKeys.mine` and replaces the route with the next active budget, or onboarding. Use it in the budget layout `mobile/src/app/(app)/budgets/[budgetId]/_layout.tsx`
- [X] T098 [US5] Create `mobile/src/app/(app)/budgets/[budgetId]/members/[membershipId].tsx`:
  - role choice (Admin, Membre, Lecteur), shown when `useCan('members.manage')` and the target isn't the owner
  - "Retirer du budget" with a confirmation sheet
  - "Transférer la propriété", owner only, with a confirmation that explains the owner becomes Admin

  A `stale_state` response refreshes the screen and shows the up-to-date state
- [X] T099 [US5] In `members/index.tsx`, add a "Anciens membres" section (name plus the text label "ancien membre"; "Ancien membre" with no name when the account was deleted), a "Quitter le budget" action for non-owners (confirmation, then leave), and an owner hint "Transférez la propriété ou supprimez le budget pour partir"
- [X] T100 [P] [US5] Create `mobile/src/app/(app)/budgets/[budgetId]/members/history.tsx` (membership events list, owner and admins only, infinite scroll on `nextCursor`) and add every US5 string to the i18n files

---

## Phase 8: User Story 6 - Budget settings and deletion (Priority: P3)

**Goal**: The owner and Admins edit the name and start day; only the owner deletes (by typing the name); members are notified; the owner can restore within 30 days; then the budget is purged.

**Independent Test**: Rename, change the start day, delete by typing the name, check the other member is notified and loses access, restore from "Récemment supprimés", then advance 30 days and check the purge (quickstart scenario 10).

### Tests for User Story 6 ⚠️

- [ ] T101 [P] [US6] Write `backend/src/budgets/application/use-cases/us6.spec.ts` covering:
  - rename emits `settings_changed` with `{ changed: ['name'] }`
  - start day 1 → 28 on 2026-11-16 stores a rule from `planStartDayChange`, and `currentMonth` stays `11-01..11-30`
  - a currency change with any `member_income` row → `currency_locked`
  - delete with `confirmName` differing in case or spaces → `confirm_name_mismatch`
  - delete sets `deleted_at` and `deleted_by`, revokes every pending invitation and publishes `budget.deleted` to the other current members
  - restore at day 29 clears `deleted_at`, leaves invitations revoked (FR-038c) and publishes `budget.restored`
  - restore at day 30 → not found
  - purge removes budgets deleted more than 30 days ago
- [X] T102 [P] [US6] Write `backend/test/budgets/settings-deletion.e2e-spec.ts` covering:
  - `PATCH` as an admin → 200; as a member → 403
  - `pendingMonthStartDay` is returned after a start-day change
  - `DELETE` as an admin → 403; as the owner with the wrong name → `400 confirm_name_mismatch`; with the exact name → 204
  - after delete, the other member gets 404, and after `drainOutbox()` receives an email and a push naming the owner
  - `GET /v1/me/budgets` shows it under `recentlyDeleted` with `purgeAt` for the owner only
  - `POST /restore` → 200 with the same members and roles, and the old invitation code still answers 410
  - with `e2e.clock` moved 31 days and the purge job run, `POST /restore` → 404 and the rows are gone
  - a non-owner `POST /restore` → 404

### Implementation for User Story 6

- [X] T103 [US6] Extend `backend/src/budgets/domain/entities/budget.ts` with `rename`, `changeStartDay` (via `planStartDayChange`), `changeCurrency` (refused when amounts exist), `delete(actor, confirmName)` (exact string match) and `restore(actor, now)` (within 30 days, deleted by the caller)
- [X] T104 [US6] Implement `backend/src/budgets/application/use-cases/{update-budget-settings,delete-budget,restore-budget,purge-budgets}.ts`. Delete revokes pending invitations in the same transaction. Make T101 pass
- [X] T105 [US6] Add `PATCH /budgets/:budgetId` (`budget.settings.edit`), `DELETE /budgets/:budgetId` (`budget.delete`) and `POST /budgets/:budgetId/restore` to `budgets.controller.ts`. Restore uses a dedicated `deleted-budget-owner.guard.ts`: it passes only when the budget is deleted, `deleted_by` equals the caller and the caller's owner membership is current, and returns 404 otherwise. Fill `recentlyDeleted` in `list-my-budgets`. Register the routes in the authz registry, with restore marked as the special case (non-member → 404, live budget → 404)
- [X] T106 [P] [US6] Implement `backend/src/budgets/infrastructure/notifications/{budget-deleted,budget-restored}.handler.ts` with mail templates (fr and en, following T065): who deleted or restored it, the budget name, and for deletion "le propriétaire peut le restaurer jusqu'au <date>". Pushes per `contracts/links-and-notifications.md` (restored → `data.url = '/budgets/<id>'`). Make T102 pass
- [X] T107 [P] [US6] Implement `backend/src/budgets/infrastructure/jobs/purge-budgets.job.ts`, daily at 03:00 Europe/Paris under `withAdvisoryLock`, calling `purge-budgets` (a hard delete with cascades)
- [X] T108 [US6] Create `mobile/src/app/(app)/budgets/[budgetId]/settings/index.tsx`:
  - name, start day (1–28) and currency (locked with an explanation when amounts exist)
  - read-only for members and viewers via `useCan('budget.settings.edit')`
  - a start-day change shows "s'applique à partir du <effectiveFrom>"
  - "Supprimer le budget" shown only with `useCan('budget.delete')`
- [X] T109 [US6] Create `mobile/src/app/(app)/budgets/[budgetId]/settings/delete.tsx`: explains the 30-day restore window; a text field where the button stays disabled until the typed text equals the budget name exactly; confirm with a warning haptic; then invalidate caches and go to the next active budget
- [X] T110 [US6] Add a "Récemment supprimés" section to `mobile/src/app/(app)/budgets/picker.tsx`, visible only when `recentlyDeleted` isn't empty: name, "supprimé le …, restaurable jusqu'au …", and a Restaurer button that opens the restored budget. Add all US6 strings to the i18n files

---

## Phase 9: User Story 7 - Viewer role (Priority: P3)

**Goal**: A Viewer sees everything shared in the budget and can change nothing. The app hides every edit control and the server refuses every write.

**Independent Test**: Invite a Viewer, accept (no income prompt), and confirm no edit controls are visible and every write route returns 403.

### Tests for User Story 7 ⚠️

- [X] T111 [P] [US7] Write `backend/test/budgets/viewer.e2e-spec.ts` covering:
  - accepting a viewer invitation → `askIncome: false`, and the viewer has no income reminder (`myIncomeMissing: false`)
  - the viewer reads the budget, members (with every member's income) and settings
  - the viewer can leave
  - a loop over every registry entry with `write: true` confirms 403
- [X] T112 [P] [US7] Write `mobile/src/app/(app)/budgets/[budgetId]/members/index.test.tsx` and `settings/index.test.tsx` (React Native Testing Library) to check that, with `myRole: 'viewer'`, no Inviter, role, remove, edit or delete controls are rendered and "Quitter le budget" is

### Implementation for User Story 7

- [X] T113 [US7] Review every budget screen under `mobile/src/app/(app)/budgets/` and make sure each create, edit and delete control is gated by `useCan`. Hide the income reminder and income entry for viewers. Show the role "Lecteur" as text. Make T112 pass
- [X] T114 [US7] Make sure `get-budget` returns `myIncomeMissing: false` for viewers and `MemberView.currentMonthIncome: null` for viewers. Make T111 pass

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Hand-off to 001 account deletion and export, plus hardening, accessibility and validation

### 001 integration (account deletion and export)

- [X] T115 Write `backend/test/budgets/account-deletion.e2e-spec.ts` covering:
  - an owner of a shared budget requests account deletion → not blocked
  - at finalization (run 001's finalize job with `e2e.clock` +7 days): the oldest Admin becomes owner (`pickNewOwner`), else the oldest person; the new owner and Admins get `budget.owner_changed`
  - a budget where they were alone is deleted
  - their budgets in the 30-day restore window are erased immediately
  - their memberships end with `left_reason = 'account_deleted'` and `display_name_snapshot` cleared, so they show as the anonymous "Ancien membre"
  - invitations they sent are revoked
  - the export contains their budgets, memberships and own incomes
- [X] T116 Implement the remaining `BudgetMembershipPort` methods (`cancelInvitationsSentBy`, `finalizeMemberDeletion` using `pickNewOwner` from `packages/shared/src/domain/ownership.ts`, `previewMemberDeletion`) and `BudgetExportPort.exportForUser` in `backend/src/budgets/infrastructure/identity-ports/`. Add a `budget.owner_changed` handler (push and email to the new owner and Admins). Bind both tokens in `backend/src/identity/identity.module.ts` and delete `backend/src/identity/infrastructure/budgets/noop-budget-ports.ts`. Make T115 pass

### Hardening and validation

- [X] T117 [P] Check every log line, outbox payload, email and push for amounts and emails. Add a test in `backend/test/budgets/privacy.e2e-spec.ts` that records income, triggers every notification, then asserts no mail body, push body or `membership_event.details` contains the income digits or an email address (FR-042, Principle III)
- [ ] T118 [P] Check SC-007 and Principle VIII on the picker, members, member detail, invite, invitation, income, settings and delete screens, with 6 members, a 60-char budget name and long first names, at the largest font size, in light and dark mode, with VoiceOver and TalkBack: no truncation, every control labelled, 44 pt targets, roles as text. Fix the screens under `mobile/src/app/(app)/budgets/` and `mobile/src/app/i/`
- [ ] T119 [P] Measure API p95 latency for the 002 endpoints with 6-member budgets (target < 300 ms), adding `backend/test/budgets/performance.e2e-spec.ts` modelled on `backend/test/export-performance.e2e-spec.ts`
- [X] T120 Run `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter two-cents-backend test:int` and `pnpm --filter two-cents-backend test:e2e`, and fix every failure. `backend/test/authz/route-coverage.e2e-spec.ts` must list every `:budgetId` route
- [ ] T121 Run quickstart manual scenarios 1–11 in `specs/002-shared-budgets/quickstart.md` on iOS and Android development builds. Record SC-001 (median time to join, under 2 min), SC-004 (under 30 s) and SC-005 (under 1 s) in that file

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies. T002 blocks T026
- **Foundational (Phase 2)**: depends on Setup; blocks every story. Within it, tests T005–T009 come before implementation T010–T014; T015 comes before the contracts; T022 → T023 → T024
- **US1 (Phase 3)**: after Foundational
- **US2 (Phase 4)**: after US1 (needs a budget and the members screen shell)
- **US3 (Phase 5)**: after US1. Can run in parallel with US2
- **US4 (Phase 6)**: after US2 (invitations exist)
- **US5 (Phase 7)**: after US1 on the backend (e2e tests use `seedMember`, not invitations). The mobile screens need `members/index.tsx` from T074 (US2)
- **US6 (Phase 8)**: after US1. Restore UI needs the picker from US3 (T082)
- **US7 (Phase 9)**: after US2 and US5 (all write routes exist)
- **Polish (Phase 10)**: after the stories in scope. T115–T116 need US5 and US6

### Story graph

```text
Setup → Foundational → US1 ─┬─> US2 ─┬─> US4
                            │        └─> US7 (also needs US5)
                            ├─> US3 ─> US6 (picker section)
                            └─> US5 (backend) ──> Polish (001 ports)
```

### Within each story

- Tests first, failing → entities and value objects → use cases → Drizzle adapters → controllers plus authz registry entries → notification handlers → mobile API → screens → i18n

---

## Parallel Examples

### Foundational

```text
Together: T005 budget-month.spec, T006 membership.spec, T007 permissions.spec, T008 invite-code.spec, T009 money.spec
Then together: T010, T011, T012, T013, T014
Together: T016 budgets.ts, T017 members.ts, T018 invitations.ts, T019 income/push.ts, T020 outbox.ts
Together (after T025): T027 expo-push-sender, T028 advisory-lock, T029 retention job
```

### User Story 1

```text
Together: T038 budget.spec, T039 us1.spec, T040 create.e2e-spec
Together: T041 entities, T046 mobile api.ts
```

### User Story 2

```text
Together: T050, T051, T052, T053, T054, T055 (all test files)
Together: T056 entities, T057 HMAC hasher, T067 pending-invite, T068 push registration
```

### User Story 5

```text
Together: T090 membership.spec, T091 us5.spec, T092 members.e2e-spec
Together after T095: T096 member-removed handler, T100 history screen
```

---

## Implementation Strategy

### MVP first (US1 + US2, both P1)

1. Phase 1 Setup, then Phase 2 Foundational (the guard and the coverage suite exist before the first route)
2. Phase 3 US1 → **stop and validate**: one person can create and open budgets
3. Phase 4 US2 → **stop and validate**: run quickstart scenarios 2–5 and time SC-001

US1 alone is a usable demo. US1 + US2 is the real MVP (sharing is the reason the app exists).

### Incremental delivery

1. US3 (picker), then US4 (pending invitations), then US5 (members and roles): the P2 set
2. US6 (settings, delete, restore), then US7 (viewer): the P3 set
3. Polish: the 001 account-deletion hand-off (T115–T116) is required before 001's deletion flow is released with real budgets

### Notes

- [P] tasks touch different files and don't depend on unfinished tasks
- Every new `:budgetId` route must get an entry in `backend/test/authz/budget-route-cases.ts` in the same task that adds it, or the coverage suite fails
- Commit after each task or logical group, with the `[#<issue>]` suffix used in this repo

---

## Implementation notes (2026-11-16)

- **Use-case unit specs with in-memory fakes (T032, T039, T051, T084, T091, T101) were not written.** The same rules are covered by e2e tests against a real Postgres (`backend/test/budgets/*.e2e-spec.ts`, `backend/test/authz/route-coverage.e2e-spec.ts`), plus domain specs (`packages/shared/test/*.spec.ts`, `backend/src/budgets/domain/entities/entities.spec.ts`).
- **Resending an email invitation issues a new code** (T084 said it keeps the hash). Only the HMAC is stored, so the email can't repeat the old code; the previous link stops working.
- **Use cases are grouped per area** (`application/use-cases/{budgets,invitations,joining,members,income,push-devices,account-handoff}.ts`) instead of one file per use case. Drizzle adapters for income, events, push devices and code failures are in `drizzle-other.repositories.ts`.
- **`BudgetsCoreModule`** (no HTTP) is imported by `IdentityModule` for the 001 ports; `BudgetsModule` adds the controllers. This avoids a module cycle.
- **The public install page** lives in `backend/src/budgets/infrastructure/invite-page/` (it reads env, which the presentation layer may not).
- **Error codes are upper case** on the wire (`BUDGET_NOT_FOUND`), as in 001.
- **Mobile screen tests** live in `mobile/src/features/budgets/*.test.tsx`: test files under `src/app/` become routes in Expo Router.
- **A web smoke test** (create budget → code invitation → sign-up from the link → accept → income) found and fixed two bugs: CORS didn't allow `PUT`, and the invitation screen couldn't retry after the email got confirmed.
- **Backend tests need Node 24** (`fnm use 24`): on Node 22, Jest can't `require` the ESM-only `@nestjs/*` packages.
