# Implementation Plan: Shared Budgets & Membership

**Branch**: `002-shared-budgets` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-shared-budgets/spec.md`

## Summary

Households share a **budget**: one owner, admins, members and viewers (2 people typical, 6 at most).
People join through email invitations or 6-character code/link invitations. The backend
(NestJS + PostgreSQL) enforces membership on every budget-scoped route, returning 404 to
non-members. A route-discovery e2e test fails when a route has no authorization case. The
pure rules (budget month boundaries including start-day transitions, who counts in a month,
the permission matrix, invite code normalization, amount parsing) live in a new shared
`@two-cents/shared/domain`. All payloads live in `@two-cents/shared/contracts` (Zod), in the
single `packages/shared` package shared with 001-user-accounts. The Expo app adds a budget
picker, members and invitation screens, a deep-link invitation route and the post-sign-up
code prompt.

This is the first feature to need a database, shared packages, i18n, email and push, so the
plan also settles those foundations ([research.md](research.md) R1–R13), aligned with
001-user-accounts (same ORM, shared package, validation pipe, email adapter and compose file);
whichever feature is implemented first builds them.

## Technical Context

**Language/Version**: TypeScript 6 (strict) on Node 24.9+ (backend) and Hermes / React Native 0.88 (Expo SDK 58)

**Primary Dependencies**: NestJS 12, Drizzle ORM (drizzle-orm, drizzle-kit, pg, @nestjs/drizzle), Zod (in-house validation pipe), @nestjs/schedule, @nestjs/throttler, expo-server-sdk, @nestjs/mail (SMTP: Brevo in production, Mailpit in dev), @nestjs/outbox (Postgres store via Drizzle); Expo Router, TanStack Query, expo-notifications, expo-linking, i18next + react-i18next + expo-localization

**Storage**: PostgreSQL 18 (EU-hosted in production); Mailpit for dev email

**Testing**: Jest (domain unit and backend unit), Jest + Supertest against a real Postgres (backend e2e, Testcontainers or the compose DB), React Native Testing Library for screens with logic (invitation, income step)

**Target Platform**: iOS 17+ and Android 10+ (development build, needed for Universal/App Links); Linux container for the API

**Project Type**: Mobile app + API, with shared TypeScript packages

**Performance Goals**: Budget switch shown in < 1 s from cache (SC-005); invitation screen interactive < 1 s after the link opens; API p95 < 300 ms for every endpoint in this feature

**Constraints**: Money in integer minor units only; no amounts in emails, pushes or logs; non-member gets 404 on every budget route; invitation codes stored only as HMAC; ≤ 6 people per budget enforced under a row lock

**Scale/Scope**: Thousands of households at launch; ≤ 6 people and a handful of budgets per user; about 20 endpoints and about 9 screens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Money is exact | ✅ | Income stored as `bigint` minor units + currency, sent as an integer string; `parseAmount` accepts `12,5`/`12.5`; currency locked once amounts exist; `member_income.updated_by/at` and `membership_event` give traceability |
| II | Calculations tested first | ✅ | `budgetMonthFor` (with transition months), `isIncludedInMonth` and `can` live in `packages/shared/src/domain`, written test-first and used by both sides |
| III | Privacy by default | ✅ | `BudgetAccessGuard` on every budget route (404 to non-members), plus a mechanical coverage test (R10). Codes stored hashed. The public install page shows no budget data. Emails, pushes, events and logs carry no amounts. Push tokens die with their session |
| IV | Mobile-first, native | ✅ | Picker as a native form sheet, members as a stack, Accept/Decline with haptics. Invitation flow kept to a few screens for the 2-minute target. The quick-expense path is untouched: the app reopens directly on the last budget (no picker in the way) |
| V | One design system | ✅ | Members, picker and invitation screens use shared tokens and components. Income is shown only through the shared amount component |
| VI | French first | ✅ | i18next with a French catalog, introduced here. Emails and pushes are rendered from the catalog in the recipient's language. Dates use the locale |
| VII | Contract-first API | ✅ | `@two-cents/shared/contracts` (Zod) used by both sides, a global validation pipe, `/v1` prefix |
| VIII | Accessible | ✅ | Roles shown as text labels, not color alone. "Former member" as a text label. 44 pt targets. Checked at the largest font with 6 members (SC-007) |
| IX | AI optional | N/A | No AI in this feature |
| X | Simplicity | ✅ (justified) | New dependencies are each justified in research.md. No Redis or queue: jobs use `@nestjs/schedule` + advisory locks; delivery uses the official `@nestjs/outbox` relay. No feature flags |

**Gate result: PASS.** One justified addition (clean-architecture layers), listed in Complexity Tracking.

## Cross-spec decisions with 001 (resolved)

The three conflicts found while planning ([research.md R14](research.md)) are settled and both specs updated:

1. **C1, Apple relay vs email-bound invitations**: 002's email binding kept; relay users join with a code invitation (001 spec updated).
2. **C2, an owner deleting their account**: never blocked (001 SC-003). At permanent deletion, ownership transfers automatically to the oldest Admin, else the oldest person (project owner's decision; 002 edge case updated, shared `pickNewOwner`).
3. **C3, deleted-account name**: an anonymous "Ancien membre" (001, GDPR); someone who left or was removed keeps their name (002 edge case updated).

## Project Structure

### Documentation (this feature)

```text
specs/002-shared-budgets/
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── rest-api.md
│   └── links-and-notifications.md
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
pnpm-workspace.yaml                 # NEW: backend, mobile, packages/*
.node-version                       # NEW: 24.9 (constitution, currently missing)
docker-compose.yml                  # NEW (shared with 001): postgres:18, postgres-test, mailpit

packages/shared/                    # NEW (shared with 001): @two-cents/shared
└── src/
    ├── contracts/                  # subpath export @two-cents/shared/contracts (Zod)
    │   └── {common,budgets,members,invitations,income,push}.ts
    └── domain/                     # subpath export @two-cents/shared/domain (pure, test-first)
        ├── budget-month.ts  (+ .spec.ts)
        ├── membership.ts    (+ .spec.ts)   # isIncludedInMonth
        ├── permissions.ts   (+ .spec.ts)
        ├── invite-code.ts   (+ .spec.ts)
        ├── ownership.ts     (+ .spec.ts)   # pickNewOwner (also used by 001 account deletion)
        └── money.ts         (+ .spec.ts)   # parseAmount

backend/
├── src/
│   ├── shared-kernel/              # shared with 001 (see 001 plan): ports, Drizzle + transaction runner, mail, outbox, AuthGuard, pipe
│   │   └── infrastructure/
│   │       ├── outbox/             # OutboxModule (@nestjs/outbox, fromDrizzle), EventPublisher adapter (uses current tx)
│   │       ├── push/               # PushSender (Expo)
│   │       └── well-known/         # AASA + assetlinks
│   ├── identity/                   # spec 001 (test-only AuthGuard stub until it lands)
│   └── budgets/                    # THIS FEATURE — clean architecture (001 research R19)
│       ├── domain/
│       │   ├── entities/           # budget, membership, invitation, member-income, push-device
│       │   ├── value-objects/      # budget-name, month-start-day, role, invite-code, money (minor units + currency)
│       │   └── ports/              # BudgetRepository, MembershipRepository, InvitationRepository, IncomeRepository, MembershipEventLog
│       ├── application/
│       │   ├── ports/              # EventPublisher (outbox), BudgetNotifier, Clock, TransactionRunner, AdvisoryLock
│       │   └── use-cases/          # create/rename/delete/restore-budget, invite-by-email, create-code-invitation, accept/decline/revoke/resend,
│       │                           # change-role, remove-member, leave, transfer-ownership, record-income, switch-budget, expire-invitations, purge-budgets
│       ├── infrastructure/
│       │   ├── persistence/        # drizzle-*.repository.ts + mappers (row locks, advisory locks)
│       │   ├── notifications/      # @OnOutboxMessage handlers → mail classes (@nestjs/mail) + push
│       │   ├── identity-ports/     # implements 001's BudgetMembershipPort and BudgetExportPort
│       │   └── jobs/               # expire-invitations, purge-budgets, outbox-retention (call use cases)
│       ├── presentation/http/      # budgets, members, invitations, income controllers; BudgetAccessGuard, @RequirePermission; public /i/:code page
│       └── budgets.module.ts       # binds ports → adapters
└── test/
    ├── authz/route-coverage.e2e-spec.ts   # SC-002 mechanical coverage
    └── budgets|members|invitations|income/*.e2e-spec.ts

mobile/src/
├── app/
│   ├── i/[code].tsx                # invitation screen (deep link target)
│   └── (app)/
│       ├── onboarding/{choose,join-code}.tsx       # create or join; post-sign-up code prompt
│       ├── budgets/new.tsx
│       ├── budgets/picker.tsx                       # form sheet, incl. "Récemment supprimés"
│       └── budgets/[budgetId]/
│           ├── members/{index,invite,[membershipId]}.tsx
│           ├── income.tsx                           # post-accept + reminder target
│           └── settings/{index,delete}.tsx
├── features/budgets/               # query hooks, active-budget logic, pending-code holder
└── i18n/{index.ts,fr.json,en.json}
```

**Structure Decision**: A mobile + API layout with the existing `backend/` and `mobile/`, plus a
root pnpm workspace and one shared package, `packages/shared` (common with 001). This fulfils the constitution's
"first plan that needs them decides the location".

## Implementation order (for /speckit-tasks)

1. Foundations (skip any already built by 001): workspace, `.node-version`, compose, Drizzle, `packages/shared`, i18n, test auth stub
2. Domain functions test-first (budget month, inclusion, permissions, code, money)
3. US1 Create, plus the guard and the authz coverage test (from the first route on)
4. US2 Invite and join: owner side, invitee side, outbox, email, push, deep links, install page, income step
5. US3 Picker and last-opened
6. US4 Pending invitations management
7. US5 Members, roles, ownership, leave, events
8. US6 Settings, delete and restore, purge job
9. US7 Viewer (mostly falls out of the permission matrix and tests)
10. Polish: accessibility at the largest font with 6 members, dark mode, screen reader

## Post-Design Constitution Re-check

Re-checked against data-model.md and the contracts:

- I: no `number` money fields in the contracts (`amountMinor` is an integer string) ✅
- III: the restore route is the only exception to "deleted = 404", it has its own guard, and the coverage test lists it ✅; `membership_event.details` excludes amounts and emails ✅
- VII: every endpoint in rest-api.md maps to a contracts module ✅
- X: the outbox + scheduler replaces a queue system ✅

**Result: PASS.**

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| Clean architecture layers (entities, use cases, ports, adapters) — 001 research R19 | Project owner's requirement; membership, role and invitation rules testable with in-memory fakes; same structure as 001 | Nest services calling Drizzle directly: rules coupled to the ORM, use-case tests need a database |
