# Research: Shared Budgets & Membership

**Feature**: 002-shared-budgets | **Date**: 2026-11-16

The repo is a fresh skeleton (NestJS starter in `backend/`, Expo Router starter in `mobile/`).
There is no database, auth or shared package yet, and 001-user-accounts has a spec but no plan.
So this research settles foundation choices that 001 will reuse, plus the 002-specific ones.

---

## R1. Database

- **Decision**: PostgreSQL 18.
- **Rationale**: Relational data with hard invariants (exactly one owner, ≤ 6 people, one pending
  invitation per email) that map directly onto partial unique indexes, row locks
  (`SELECT … FOR UPDATE`) and transactions. `bigint` columns hold money in minor units
  (Principle I). Managed EU hosting is easy to find (GDPR).
- **Alternatives considered**: SQLite (no concurrent writers, weak for row locks);
  MongoDB (multi-document invariants need application-level locking).
- **Constitution**: This is the first choice of database, not a change, so no amendment
  is needed. Later changes would need one.

## R2. Data access layer

- **Decision**: **Drizzle ORM** + `drizzle-kit` migrations with the `pg` driver, wired
  with the official `@nestjs/drizzle` module (project owner's choice, shared with
  001-user-accounts research R2).
- **Rationale**: SQL-first, typed, light, no code-generation step. Partial indexes,
  `FOR UPDATE`, the conditional `UPDATE … WHERE status='pending'` and advisory locks are
  native. `@nestjs/outbox` uses `fromDrizzle(db)` and its `nest_outbox` tables ship as a
  drizzle-kit custom migration (R9).
- **Alternatives considered**: Prisma (briefly chosen, then dropped: generated client, raw
  SQL for row locks and partial indexes); TypeORM (weaker typing, a history of decorator
  magic); MikroORM (unit-of-work is more than this needs).

## R3. Shared packages (Principles II and VII)

- **Decision**: A pnpm workspace at the repo root with **one** shared package,
  `packages/shared` (`@two-cents/shared`), aligned with 001-user-accounts research R1. It
  has two subpath exports:
  - `@two-cents/shared/contracts` (`src/contracts/`): Zod schemas for every request and
    response, plus inferred types.
  - `@two-cents/shared/domain` (`src/domain/`): pure functions (budget month computation,
    membership-in-month inclusion, role permission matrix, invitation code normalization).
  `backend/` and `mobile/` depend on it through `workspace:*`. A single root
  `pnpm-lock.yaml` replaces the two per-package lockfiles.
- **Rationale**: The constitution says "the first plan that needs them decides the location";
  this is that plan. Zod runs on Hermes (mobile) and Node.
- **Alternatives considered**: Two packages (`contracts` + `domain`: more config for no gain
  yet); generating clients from OpenAPI (a second source of truth); copying types (forbidden
  by Principle VII).
- **Backend validation**: A small in-house global `ZodValidationPipe` (shared with 001, no
  `nestjs-zod` dependency) validates every body, query and param against the contracts
  schema, so invalid input gets a 400.

## R4. Authentication dependency on 001

- **Decision**: 002 assumes an `AuthGuard` from 001 that puts
  `{ userId, emailConfirmed, firstName }` on the request. Until 001 lands, a test-only auth
  module (header `x-test-user-id`, enabled only when `NODE_ENV=test`) lets 002 be built
  and e2e-tested on its own.
- **Rationale**: Each feature stays independently testable without making 001's design
  choices here.
- **Update (2026-11-16)**: 001 is implemented first, so 002 uses its real `AuthGuard`
  (`{ userId, sessionId, emailConfirmed, firstName, status }`). The test-only stub is dropped;
  e2e tests sign up real users (`backend/test/support/users.ts`).

## R5. Budget month computation and time zone

- **Decision**: Each budget stores an IANA time zone (default: the creator device's zone,
  normally `Europe/Paris`). The budget month for a date is `[startDay of month M, startDay
  of month M+1)` in that time zone, with `startDay ∈ 1..28`. A budget month is identified
  by its start date (`YYYY-MM-DD`). The logic lives in `packages/shared/src/domain` as
  `budgetMonthFor(instant, startDay, timeZone)`, test-first.
- **Start-day changes** (FR-005): Store a history of
  `budget_month_start_rule(effective_from DATE, start_day)`. The current month keeps its dates.
  The **transition month** starts the day after the current month ends and ends the day
  before the first occurrence of the new start day that is **at least 15 days** after the
  transition month's start. Normal months follow. So a transition month lasts 15–45 days,
  never a 3-day stub:
  - 1 → 28, changed 16 Nov: current 1–30 Nov; transition 1–27 Dec (27 days); then 28 Dec – 27 Jan.
  - 28 → 1, changed 16 Nov: current 28 Oct – 27 Nov; transition 28 Nov – 31 Dec (34 days); then January.
  All of these are unit-tested first in `packages/shared/src/domain`.
- **Time zone handling without a date library**: Domain functions work only on calendar dates
  (`YYYY-MM-DD`, pure integer arithmetic). Converting "now" into the budget's local date
  happens at the edges with `Intl.DateTimeFormat(…, { timeZone })`, which exists in Node and
  Hermes. No new dependency.
- **Alternatives considered**: Storing UTC month boundaries (breaks around DST and midnight
  in Paris); allowing days 29–31 (rejected in the spec).

## R6. Invitation codes and links

- **Decision**:
  - Code: 6 characters from the Crockford Base32 alphabet (`0-9 A-Z` without `I L O U`,
    32 symbols, about 1.07 billion combinations), generated with `crypto.randomInt`.
    Input is normalized (`toUpperCase`, `O→0`, `I/L→1`, strip spaces and dashes) by a domain
    function shared with the app. Displayed as `ABC-123`.
  - Every invitation, email or code, has a code (FR-016 shows it on the install page).
  - Storage: only `HMAC-SHA256(code, INVITE_CODE_SECRET)` is stored (`code_hash`, unique among
    pending invitations). The plain code is shown once at creation or resend and put in the
    email. "Resend" on a code invitation issues a **new** code and invalidates the old one.
  - Link: `https://<app-domain>/i/<CODE>`.
  - Guessing protection (FR-022): per account, 5 failed code lookups per 15 minutes, then
    a 15-minute block. Per IP, 30 per hour on the public `/i/:code` page. With at most
    a few thousand live codes and those limits, the chance of guessing a code is negligible.
- **Rationale**: Short enough to type in about 10 s, with no look-alike characters. The hash
  means a database leak exposes no usable code (consistent with 001 FR-051).
- **Alternatives considered**: Long random link token plus a separate code (two secrets for
  one invitation, more to explain); a plain-text code (re-showable, but violates the
  001 no-plaintext-tokens rule).

## R7. Deep links and the "app not installed" path (FR-015, FR-016, FR-016a)

- **Decision**:
  - iOS Universal Links and Android App Links on the app domain for the path `/i/*`
    (`apple-app-site-association` and `assetlinks.json` served by the backend). Expo
    Router handles the route `mobile/src/app/i/[code].tsx`.
  - App not installed: the same URL serves a minimal HTML page from the backend, in French,
    with App Store and Play Store buttons and the code in large type. It shows **no budget
    or inviter data** (Principle III): it's a public page.
  - After sign-up (001 onboarding), the app shows "Vous avez un code d'invitation ?" with
    a skip option. There's no deferred deep linking (clarification Q5).
  - Signed out and link opened: the code is kept in memory (and in secure storage while the
    sign-up flow is in progress) and the invitation screen opens after sign-up or sign-in.
- **Alternatives considered**: Branch or Firebase Dynamic Links (an outside service and
  tracking; rejected in clarification Q5).

## R8. Push notifications

- **Decision**: `expo-notifications` on the app, Expo Push Service from the backend
  (`expo-server-sdk`). Device push tokens are stored per session in `push_device`. A push
  carries only a title and body in French with the budget name and a person name (FR-042),
  plus `data: { url: "/i/<CODE>" }` or `{ url: "/budgets/<id>" }`.
- **Rationale**: Expo-first (constitution), one integration for APNs and FCM.
- **Alternatives considered**: Direct APNs/FCM (two integrations, more secrets).
- **Note**: 001 doesn't define push token registration. 002 owns `POST /me/push-devices`
  and 001 can reuse it.

## R9. Transactional email

- **Decision**: **`@nestjs/mail`** (official NestJS package, shared with 001-user-accounts
  research R14) with its `SmtpTransport`: **Brevo**'s SMTP relay (EU-hosted, GDPR-friendly
  French provider) in production, **Mailpit** in dev. One injectable mail class per email
  (`Mailable<TData>`), `.html` templates with auto-escaping, French base file plus `.en.html`
  variants selected by the `locale` send option (001 FR-053). e2e tests override the transport
  with `InMemoryMailTransport` and assert on sent mails.
- **Delivery**: **`@nestjs/outbox`** (official NestJS package) with `PostgresOutboxStore`
  and `fromDrizzle(db)`. Invitation, deletion and restore notifications are added with
  `outbox.add(tx, { topic, payload })` inside the same Drizzle transaction (`db.transaction(async tx => …)`) as the business
  change, then `outbox.notify()` after commit, so nothing is sent for a rolled-back change.
  `@OnOutboxMessage` handlers send the email (`mailer.send(..., { idempotencyKey:
  message.id, retry: false })`, rethrowing a permanent `MailError` as
  `NonRetryableMessageError`) or the push. The relay (1 s polling, leases with `SKIP LOCKED`,
  safe with several instances) and retries (20 attempts, 1 s → 5 min backoff, dead letters)
  come with the package. A provider outage never fails the API call.
- **Retention (Principle III)**: payloads hold recipient emails and names, so a daily
  `@nestjs/schedule` job runs `OutboxInbox.prune('30d')` and
  `OutboxDeadLetters.purge({ failedBefore: 14 days ago })`. **Verify at setup** how long the
  store keeps *published* messages and purge them after 30 days if the package does not.
- **Migrations**: the store owns a separate `nest_outbox` schema. Its SQL
  (`PostgresOutboxStore.migrationSql({ statementBreakpoints: true })`) is added as a
  drizzle-kit custom migration and the store runs with `migrate: false`, so one
  `drizzle-kit migrate` step creates everything; drizzle-kit is limited to `public`
  (`schemaFilter`) so it never drops `nest_outbox`.
- **Confirmed against `@nestjs/outbox@0.1.4`** (2026-11-16, read from the installed package):
  - Store registration: a provider `{ provide: PostgresOutboxStore, inject: [getDrizzleToken(), OutboxStorage],
    useFactory: (db, storage) => new PostgresOutboxStore({ executor: fromDrizzle(db), migrate: false }, storage) }`
    next to `OutboxModule.forRoot({ ... })` (global by default). `PostgresOutboxStore` and `fromDrizzle` come from
    `@nestjs/outbox/postgres`; the store isn't a module option.
  - Producer: `Outbox<Tx>.add(tx, { topic, payload, key? })` must get a real transaction (the db itself throws
    `OutboxTransactionRequiredError`); `outbox.notify()` after commit.
  - Consumer: `@OnOutboxMessage(topic, { consumer })` with `(payload, ctx: OutboxHandlerContext)`; `ctx.message.id`
    is the idempotency key. `NonRetryableMessageError` dead-letters without retry.
  - Migrations: `PostgresOutboxStore.migrationSql({ statementBreakpoints: true })` (static). With `migrate: false`
    startup fails while the schema is behind (`OutboxSchemaError`).
  - Retention: **published messages are deleted on publish** (`markPublished` is a `DELETE`), so only
    `OutboxInbox.prune('30d')` and `OutboxDeadLetters.purge({ failedBefore })` need a job.
  - Tests: `OutboxRelay.runOnce()` drains one batch synchronously; `relay.enabled: false` turns off polling.
- **Packages are new** (`@nestjs/mail` 0.0.x, `@nestjs/outbox` 0.1.x, first published
  September 2026): pin exact versions and keep them behind ports in `shared-kernel/infrastructure/` (001 research R19).
- **Alternatives considered**: `nodemailer` + a hand-written outbox table and drain job (more
  code to own); Postmark or Resend (US-hosted by default); SES (more setup); BullMQ + Redis
  (extra infrastructure).

## R10. Authorization (FR-039 to FR-041, SC-002)

- **Decision**:
  - All budget-scoped routes live under `/budgets/:budgetId/...`. A global
    `BudgetAccessGuard` loads the caller's **current** membership (`left_at IS NULL`, budget
    `deleted_at IS NULL`). If there's none, it returns **404 `budget_not_found`**, the same
    response as a budget that doesn't exist (FR-040).
  - A `@RequirePermission('members.manage')` decorator checks the shared domain permission
    matrix (`packages/shared/src/domain/permissions.ts`). The same matrix hides controls in the app.
    A member with too low a role gets **403 `forbidden`** (they already know the budget exists).
  - Coverage test: an e2e spec uses Nest `DiscoveryService` to list every route with a
    `:budgetId` param and **fails if any route lacks a non-member test case**, and likewise
    for write routes without a Viewer test case. That's how SC-002's "100% of endpoints" is
    enforced mechanically.
- **Alternatives considered**: PostgreSQL row-level security (strong, but it complicates
  the connection pool and migrations; can be revisited later as a second layer).

## R11. Concurrency and invariants

- **Decision**: Every membership or invitation mutation runs in one transaction that first
  locks the budget row (`SELECT … FROM budget WHERE id = $1 FOR UPDATE`). The database
  enforces:
  - exactly one current owner: partial unique index `(budget_id) WHERE role='owner' AND left_at IS NULL`
  - one pending invitation per email per budget: partial unique `(budget_id, email_normalized) WHERE status='pending' AND kind='email'`
  - one current membership per user per budget: partial unique `(budget_id, user_id) WHERE left_at IS NULL`
  The ≤ 6 rule (members plus pending invitations) is checked under the budget lock.
  Code acceptance uses `UPDATE … SET status='accepted' WHERE id=$1 AND status='pending'`
  and checks that one row was updated (the concurrent-acceptance edge case).
- **Stale actions**: Mutations take the target membership id. If the target has already
  left or changed role since the client loaded it, the API returns **409 `stale_state`**
  with the current state.

## R12. Scheduled jobs

- **Decision**: `@nestjs/schedule` with three jobs, each idempotent, single-instance via a
  PostgreSQL advisory lock (outbox delivery itself is handled by the `@nestjs/outbox` relay,
  R9, not by a job):
  1. Expire invitations (`pending` with `expires_at < now()` → `expired`), every 15 minutes.
     Reads also check `expires_at`, so the job is only for tidiness.
  2. Purge budgets with `deleted_at < now() - 30 days` (FR-038b), daily at 03:00 Europe/Paris.
     This is a hard delete with cascades.
  3. Outbox retention (prune inbox, purge handled dead letters), daily (R9).
- **Alternatives considered**: BullMQ + Redis (an extra piece of infrastructure, not needed
  at this scale).

## R13. Mobile state and navigation

- **Decision**: TanStack Query for server state (cache per `budgetId`). The active budget
  comes from the server (`GET /me/budgets` returns `lastOpenedAt`; the app opens the most
  recent). `POST /budgets/:id/open` updates it. Routes:
  `(app)/budgets/[budgetId]/…`, a picker as a form sheet, members as a stack screen, and
  `i/[code].tsx`.
- **i18n**: `i18next` + `react-i18next` + `expo-localization`, with French as the default
  catalog (Principle VI). This is the first feature that needs them; the choice is shared
  with 001.
- **Alternatives considered**: Zustand for server data (duplicates a cache); storing the
  last budget only on the device (spec says it follows the account across devices).

## R14. Cross-spec conflicts with 001-user-accounts

These were found while planning. **All three are resolved** and both specs were updated (2026-11-16).

| # | 001 says | 002 says | Proposed resolution |
|---|----------|----------|---------------------|
| C1 | "Joining a shared budget … never depends on the invitee's email matching" (Assumptions, Apple relay edge case) | Email invitations are tied to the invited email (FR-010) | Keep 002's FR-010 (the user's explicit rule). Relay users go through a **code invitation**. The mismatch screen says so and gives the inviter one tap to "send a code instead". 001's assumption updated. |
| C2 | Account deletion: a shared-budget member is removed after 7 days (FR-042), with no special case for owners | An owner can't delete their account while owning a shared budget (edge case) | **Resolved differently by the project owner**: deletion is never blocked. At permanent deletion, ownership transfers automatically to the longest-standing Admin, else the longest-standing person (`pickNewOwner`, shared domain); new owner and Admins are notified. 002 edge case updated. |
| C3 | A deleted account's entries show "former member" with **no personal data** (001 Key Entities) | A member who deletes their account keeps their name with the "former member" label (002 edge case) | **001 wins** (GDPR erasure). Someone who *left* or was *removed* keeps their name plus the "former member" label. A *deleted account* becomes an anonymous "Ancien membre". 002's edge case updated. |

Also from 001, applied here:
- 001 FR-011: an unconfirmed email can't create or accept invitations. The API returns
  403 `email_not_confirmed`.
- 001 profile currency: the default currency proposed when creating a budget.
- 001 pending deletion (7 days): the membership stays current (it isn't ended) until permanent
  deletion, so the person still counts toward the 6-person limit and still appears, as
  "Ancien membre" per 001, in the current month.

## R15. Backend architecture

- **Decision**: Clean architecture with entities, use cases, ports and adapters, exactly as
  described in 001-user-accounts research R19 (same layers, same lint enforcement, same
  `TransactionRunner` + `AsyncLocalStorage` pattern). Row locks, the conditional invitation
  `UPDATE` and advisory locks live in Drizzle repository adapters; the use cases only see
  port methods such as `invitations.acceptIfPending(id, userId)`.
- **Outbox**: an application port `EventPublisher.publish(topic, payload)`; its adapter calls
  `outbox.add(currentTx, …)` and `outbox.notify()` after commit.
