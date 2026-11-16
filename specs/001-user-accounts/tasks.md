---

description: "Task list for 001-user-accounts"
---

# Tasks: User Accounts

**Input**: Design documents from `/specs/001-user-accounts/` — [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [contracts/deep-links.md](./contracts/deep-links.md), [quickstart.md](./quickstart.md)

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included. The constitution requires tests written and seen failing before implementation for domain rules (Principle II), a non-member refusal test for every data route (Principle III), and lint + typecheck + unit + e2e before merge. Write each story's test tasks first and confirm they fail.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US8 from spec.md)
- Include exact file paths in descriptions

## Path Conventions

- Shared package: `packages/shared/src/{contracts,domain}/`, tests in `packages/shared/test/`
- Backend (clean architecture, research R19): `backend/src/shared-kernel/{domain,application,infrastructure,presentation}/`, `backend/src/identity/{domain,application,infrastructure,presentation}/`. Unit tests are colocated `*.spec.ts` (Jest `rootDir: src`); e2e tests in `backend/test/*.e2e-spec.ts`
- Mobile (Expo Router): routes in `mobile/src/app/`, other code in `mobile/src/{auth,lock,i18n,components}/`, tests colocated `*.test.ts(x)`
- Layer rule: `domain/` imports only `@two-cents/shared/domain`; `application/` imports `domain/` + `@nestjs/common` `Injectable`/`Inject`; `presentation/` calls use cases only; adapters live in `infrastructure/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace, packages, tooling and local services

- [X] T001 Create the root pnpm workspace: `pnpm-workspace.yaml` listing `backend`, `mobile`, `packages/*`; root `package.json` (private) with scripts `lint`, `typecheck`, `test` running `pnpm -r`; `.node-version` containing `24.9`; delete `backend/pnpm-lock.yaml` and `mobile/pnpm-lock.yaml` and generate a single root `pnpm-lock.yaml` with `pnpm install`
- [X] T002 [P] Scaffold `packages/shared` as `@two-cents/shared`: `packages/shared/package.json` with `exports` for `./contracts` (`src/contracts/index.ts`) and `./domain` (`src/domain/index.ts`), dependency `zod@^4`, strict `packages/shared/tsconfig.json`, Jest + ts-jest config, scripts `test`, `typecheck`, `lint`
- [X] T003 [P] Create `docker-compose.yml` at the repo root with services `postgres` (postgres:18, port 5432, db `two_cents`), `postgres-test` (postgres:18, port 5433, db `two_cents_test`, tmpfs data) and `mailpit` (ports 1025 SMTP, 8025 UI)
- [X] T004 Add backend dependencies in `backend/package.json`: `@two-cents/shared` (`workspace:*`), `drizzle-orm`, `pg`, `@nestjs/drizzle` (exact version, no caret), `@nestjs/mail` (exact version, no caret), `zod`, `argon2`, `jose`, `@nestjs/throttler`, `@nestjs/schedule`, `nestjs-pino`, `pino-http`, `fflate`, `uuid`; dev: `drizzle-kit`, `@types/pg`; add `typecheck` script (`tsc --noEmit`)
- [X] T005 [P] Create `backend/drizzle.config.ts` (`dialect: 'postgresql'`, `schema: './src/shared-kernel/infrastructure/db/schema/*.ts'`, `out: './drizzle'`, `schemaFilter: ['public']`) and add scripts `db:generate` (`drizzle-kit generate`) and `db:migrate` (`drizzle-kit migrate`) to `backend/package.json`
- [X] T006 [P] Create `backend/.env.example` with `DATABASE_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `IP_HASH_KEY`, `SMTP_URL`, `MAIL_FROM`, `APP_LINK_BASE_URL`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`, `GOOGLE_WEB_CLIENT_ID`, and a zod-validated loader that fails startup on missing values in `backend/src/shared-kernel/infrastructure/config/env.ts`
- [X] T007 Add clean-architecture import rules to `backend/eslint.config.mjs` using `no-restricted-imports` overrides: files under `**/domain/**` may not import `@nestjs/*`, `drizzle-orm`, `pg`, `**/application/**`, `**/infrastructure/**`, `**/presentation/**`; files under `**/application/**` may not import `drizzle-orm`, `pg`, `**/infrastructure/**`, `**/presentation/**`, or any `@nestjs/*` module other than `@nestjs/common`; files under `**/presentation/**` may not import `**/infrastructure/**` or `drizzle-orm`
- [X] T008 [P] Add mobile dependencies with `npx expo install` in `mobile/`: `expo-secure-store`, `expo-local-authentication`, `expo-apple-authentication`, `expo-screen-capture`, `expo-localization`, `expo-file-system`, `expo-sharing`, `expo-haptics`, `expo-device`, `@react-native-google-signin/google-signin`, `@tanstack/react-query`, `i18next`, `react-i18next`; add `@two-cents/shared` (`workspace:*`); dev: `jest-expo`, `@testing-library/react-native`; scripts `test`, `typecheck` in `mobile/package.json`
- [X] T009 Replace `mobile/app.json` with `mobile/app.config.ts`: name "Two Cents", `scheme: 'twocents'`, `ios.bundleIdentifier`, `ios.usesAppleSignIn: true`, `ios.associatedDomains` and Android `intentFilters` built from `APP_LINK_BASE_URL`, plugins `expo-router`, `expo-splash-screen` (keep current options), `expo-apple-authentication`, `@react-native-google-signin/google-signin` (iOS URL scheme from env), `expo-secure-store`, `["expo-local-authentication", { faceIDPermission: "Two Cents utilise Face ID pour déverrouiller l'app." }]`, `locales` for `fr` and `en` usage strings
- [X] T010 [P] Create `mobile/eas.json` with a `development` profile (`developmentClient: true`, internal distribution) and `production` profile
- [X] T011 [P] Rewrite `backend/dockerfile` to build from the repo root: install with `pnpm install --frozen-lockfile`, build `@two-cents/shared` and the backend, then `pnpm deploy --filter two-cents-backend --prod /prod/backend`; final stage copies only `/prod/backend` (no dev dependencies) and runs `node dist/main`
- [X] T012 [P] Verify the installed `@nestjs/drizzle`, `@nestjs/mail` APIs against https://docs.nestjs.com (module registration, `getDrizzleToken`, `SmtpTransport`, `InMemoryMailTransport`) and record any differences from research R2/R14 in `specs/001-user-accounts/research.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared rules, contracts, shared-kernel, base identity model, test harness and app shell needed by every story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Shared domain rules — tests first (Principle II)

- [X] T013 [P] Write failing tests for `normalizeEmail(raw)` ("trim + lowercase"; `"  Fabien@Example.COM "` → `"fabien@example.com"`) in `packages/shared/test/email.spec.ts`
- [X] T014 [P] Write failing tests for `validatePasswordPolicy(pw)` ("≥ 10 chars (counted as Unicode code points)"; 9 emoji fails, 10 passes) in `packages/shared/test/password-policy.spec.ts`
- [X] T015 [P] Write failing tests for `validateFirstName(raw)` ("NFC, trim, 1–50 code points"; `"Maëlle"` in NFD becomes NFC; whitespace-only fails; 51 code points fails) in `packages/shared/test/first-name.spec.ts`
- [X] T016 [P] Write failing tests for `nextLockState(count, now)` and `isLockedOut(state, now)` ("5 failures → 15 min"; 4th failure not locked; 5th locks until now+15 min; expired lock is not locked) in `packages/shared/test/lockout.spec.ts`
- [X] T017 [P] Write failing tests for `isSessionActive(session, now)` ("not revoked, idle ≤ 90 days"; exactly 90 days active, 90 days + 1 ms inactive; revoked inactive) in `packages/shared/test/session.spec.ts`
- [X] T018 [P] Write failing tests for `isEmailTokenValid(token, now)` and `emailTokenExpiry(purpose, now, deletionScheduledAt?)` ("confirm 24 h, reset 1 h, link 1 h, cancel = `deletion_scheduled_at`"; used, superseded or expired → invalid) in `packages/shared/test/email-token.spec.ts`
- [X] T019 [P] Write failing tests for `computeDeletionDate(requestedAt)` ("+ 7 days", across a DST change in Europe/Paris stays exactly 7×24 h) in `packages/shared/test/deletion.spec.ts`
- [X] T020 [P] Write failing tests for `shouldLock({ coldStart, backgroundedAt, now, settings })` ("cold start or > 30 s in background when lock enabled"; 30 s exactly → no lock; 30.001 s → lock; lock disabled → never) in `packages/shared/test/app-lock.spec.ts`
- [X] T021 [P] Write failing tests for `pickNewOwner(members)` ("oldest Admin, else oldest member"; ties broken by membership id) in `packages/shared/test/ownership.spec.ts`
- [X] T022 [P] Implement `normalizeEmail` in `packages/shared/src/domain/email.ts` (makes T013 pass)
- [X] T023 [P] Implement `validatePasswordPolicy` in `packages/shared/src/domain/password-policy.ts` (makes T014 pass)
- [X] T024 [P] Implement `validateFirstName` in `packages/shared/src/domain/first-name.ts` (makes T015 pass)
- [X] T025 [P] Implement `nextLockState` / `isLockedOut` in `packages/shared/src/domain/lockout.ts` (makes T016 pass)
- [X] T026 [P] Implement `isSessionActive` in `packages/shared/src/domain/session.ts` (makes T017 pass)
- [X] T027 [P] Implement `isEmailTokenValid` / `emailTokenExpiry` in `packages/shared/src/domain/email-token.ts` (makes T018 pass)
- [X] T028 [P] Implement `computeDeletionDate` in `packages/shared/src/domain/deletion.ts` (makes T019 pass)
- [X] T029 [P] Implement `shouldLock` in `packages/shared/src/domain/app-lock.ts` (makes T020 pass)
- [X] T030 [P] Implement `pickNewOwner` in `packages/shared/src/domain/ownership.ts` (makes T021 pass)
- [X] T031 Export all domain functions from `packages/shared/src/domain/index.ts`

### Shared contracts

- [X] T032 [P] Define every error code from `contracts/api.md` (`VALIDATION_FAILED`, `RATE_LIMITED`, `EMAIL_IN_USE`, `PASSWORD_TOO_SHORT`, `PASSWORD_BREACHED`, `ACCOUNT_PENDING_DELETION`, `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `INVALID_PROVIDER_TOKEN`, `LINK_REQUIRED`, `LINK_EXPIRED`, `SESSION_ENDED`, `TOKEN_INVALID`, `ALREADY_CONFIRMED`, `REAUTH_REQUIRED`, `CANNOT_REVOKE_CURRENT`, `NOT_PENDING`, `NOT_FOUND`) as a zod enum and the `{ error, retryAfterSeconds?, issues? }` error schema in `packages/shared/src/contracts/errors.ts`
- [X] T033 [P] Define `Tokens`, `DeviceInfo` (`deviceName` ≤ 100, `platform: "ios" | "android" | "web"`), `Me`, `AuthResult`, `Locale` (`fr` | `en`), `CurrencyCode` (ISO 4217, 3 uppercase letters) and the avatar/color key enums (preset sets) in `packages/shared/src/contracts/common.ts`; export everything from `packages/shared/src/contracts/index.ts`

### Backend shared-kernel

- [X] T034 [P] Create `DomainError` (carries an error code from T032 and optional `retryAfterSeconds`) in `backend/src/shared-kernel/domain/domain-error.ts`
- [X] T035 [P] Create ports `Clock`, `IdGenerator`, `TransactionRunner` (`run<T>(work: () => Promise<T>): Promise<T>`) with injection tokens in `backend/src/shared-kernel/application/ports.ts`
- [X] T036 Register Drizzle with `@nestjs/drizzle` (`pg` Pool from `DATABASE_URL`) in `backend/src/shared-kernel/infrastructure/db/db.module.ts`, and implement `AlsTransactionRunner` (opens `db.transaction`, stores `tx` in an `AsyncLocalStorage`, exposes `currentExecutor()` returning `tx` or `db`) in `backend/src/shared-kernel/infrastructure/db/als-transaction-runner.ts`
- [X] T037 [P] Implement `SystemClock` and `UuidV7Generator` adapters in `backend/src/shared-kernel/infrastructure/system/`
- [X] T038 [P] Implement the global `ZodValidationPipe` (400 `VALIDATION_FAILED` with `issues`) in `backend/src/shared-kernel/presentation/zod-validation.pipe.ts` and a `@ZodBody/@ZodQuery/@ZodParam` helper set
- [X] T039 [P] Implement `DomainErrorFilter` mapping codes to HTTP statuses exactly as in `contracts/api.md` (e.g. `EMAIL_IN_USE`→409, `PASSWORD_*`→422, `INVALID_CREDENTIALS`→401, `ACCOUNT_LOCKED`→423, `TOKEN_INVALID`/`LINK_EXPIRED`→410, `ACCOUNT_PENDING_DELETION`→403/409 per route) in `backend/src/shared-kernel/presentation/domain-error.filter.ts`
- [X] T040 [P] Configure `nestjs-pino` with redaction of `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.newPassword`, `*.token`, `*.refreshToken`, `*.identityToken`, `*.idToken`, `*.authorizationCode`, `*.email` in `backend/src/shared-kernel/infrastructure/logging/logger.module.ts`
- [X] T041 Wire `backend/src/main.ts` and `backend/src/app.module.ts`: global prefix `v1`, `enableShutdownHooks()`, global pipe and filter, logger, `ThrottlerModule` (default 10 requests/min per IP on routes decorated `@AuthThrottle()`), `ScheduleModule`, config module; remove the sample `app.controller.ts`, `app.service.ts`, `app.controller.spec.ts`
- [X] T042 [P] Register `MailModule` from `@nestjs/mail` with `SmtpTransport` from `SMTP_URL` and default `from` = `MAIL_FROM`, template engine pointing at `backend/src/identity/infrastructure/mail/templates/` in `backend/src/shared-kernel/infrastructure/mail/mail.module.ts`

### Base identity model

- [X] T043 Define Drizzle tables in `backend/src/shared-kernel/infrastructure/db/schema/identity.ts` exactly as data-model.md: `users` (incl. `email_normalized` "UNIQUE", `password_hash` "argon2id encoded string; NULL for provider-only accounts", `failed_login_count` "int default 0", `locked_until`, `status` enum `active` | `pending_deletion`, `deletion_requested_at`, `deletion_scheduled_at`, `email_deliverable` "boolean default true", `locale`, `currency` "char(3)"), `sessions` (incl. `refresh_token_hash` "UNIQUE", `previous_refresh_token_hash`, `device_name` "max 100 chars", `device_platform`, `last_used_at`, `reauth_token_hash`, `reauth_expires_at`, `revoked_at`, `revoked_reason` enum, index on `user_id` WHERE `revoked_at IS NULL`, FK `ON DELETE CASCADE`), `email_tokens` (`purpose` enum `confirm_email` | `reset_password` | `link_account` | `cancel_deletion`, `token_hash` "UNIQUE", `expires_at`, `used_at`, `superseded_at`, `pending_link_id`), `security_events` (`type` enum from data-model.md, `user_id` "ON DELETE SET NULL", `ip_hash`, `user_agent_family`); all ids `uuid`, timestamps `timestamptz`
- [X] T044 Generate and commit the first migration with `pnpm --filter two-cents-backend db:generate` into `backend/drizzle/`
- [X] T045 [P] Implement value objects `Email` (keeps display value + normalized via `normalizeEmail`), `FirstName`, `PlainPassword` (never serialisable: `toJSON` throws), `Locale`, `CurrencyCode` in `backend/src/identity/domain/value-objects/` with colocated `*.spec.ts`
- [X] T046 [P] Implement the `User` entity (`register`, `fromPersistence`, `assertActive`, getters; status `active` | `pending_deletion`) in `backend/src/identity/domain/entities/user.ts` with `user.spec.ts`
- [X] T047 [P] Implement the `Session` entity (`open(userId, method, device, refreshHash, now)`, `revoke(reason, now)`, `isActive(now)` via `isSessionActive`) in `backend/src/identity/domain/entities/session.ts` with `session.spec.ts`
- [X] T048 [P] Implement the `EmailToken` entity (`issue(purpose, userId, hash, now, deletionScheduledAt?)`, `consume(now)` throwing `TOKEN_INVALID` when expired/used/superseded, `supersede(now)`) in `backend/src/identity/domain/entities/email-token.ts` with `email-token.spec.ts`
- [X] T049 [P] Define repository ports `UserRepository` (`findById`, `findByNormalizedEmail`, `save`, `delete`), `SessionRepository` (`findById`, `findByRefreshHash`, `findByPreviousRefreshHash`, `listActiveByUser`, `save`, `revokeAllForUser(userId, reason, exceptSessionId?)`), `EmailTokenRepository` (`findValidByHash`, `save`, `supersedeAll(userId, purpose, now)`), `SecurityEventLog` (`record(event)`) in `backend/src/identity/domain/ports/`
- [X] T050 Implement Drizzle adapters for T049 (row ↔ entity mappers, always using `currentExecutor()` from T036) in `backend/src/identity/infrastructure/persistence/` and integration tests against `postgres-test` in `backend/src/identity/infrastructure/persistence/*.int-spec.ts` (add a Jest project for `*.int-spec.ts` in `backend/package.json`)
- [X] T051 [P] Define application ports `PasswordHasher` (`hash`, `verify`, `needsRehash`), `SecretTokenGenerator` (`generate(): { token, hash }` — 256-bit random, SHA-256 hex hash), `AccessTokenIssuer` (`issue(userId, sessionId): { token, expiresAt }`, `verify(token)`), `IdentityMailer`, `BudgetMembershipPort` (`hasAnyBudget`, `cancelInvitationsSentBy`, `finalizeMemberDeletion`), `BudgetExportPort` (`exportForUser`) in `backend/src/identity/application/ports/`
- [X] T052 [P] Implement `Argon2PasswordHasher` (argon2id, memory 19 MiB, 2 iterations, parallelism 1; `needsRehash` when parameters differ) in `backend/src/identity/infrastructure/security/argon2-password-hasher.ts` with spec
- [X] T053 [P] Implement `CryptoSecretTokenGenerator` (`crypto.randomBytes(32)`, base64url token, SHA-256 hex hash) and a `hashToken(token)` helper in `backend/src/identity/infrastructure/security/secret-token-generator.ts` with spec
- [X] T054 [P] Implement `JoseAccessTokenIssuer` (HS256 with `JWT_SECRET`, 15 min expiry, claims `sub`, `sid`) in `backend/src/identity/infrastructure/security/jose-access-token-issuer.ts` with spec
- [X] T055 [P] Implement no-op `Budget*Port` adapters (`hasAnyBudget` → false, others no-op/empty) in `backend/src/identity/infrastructure/budgets/noop-budget-ports.ts`
- [X] T056 Implement the application service `SessionIssuer` (opens a `Session`, generates refresh token, issues access token, builds `AuthResult` with `Me` incl. `hasBudget` from `BudgetMembershipPort`, records `security_events`) in `backend/src/identity/application/services/session-issuer.ts` with a unit spec using in-memory fakes
- [X] T057 Create in-memory fakes for every identity port (repositories, hasher, token generator, issuer, mailer, clock, transaction runner, budget ports) in `backend/src/identity/application/testing/fakes.ts` for use-case unit tests
- [X] T058 Implement `AuthGuard` (verifies the access token, loads the session and rejects inactive ones with 401 `SESSION_ENDED { reason }`, loads the user, attaches `{ userId, sessionId, emailConfirmed, firstName, status }` to the request) and `@CurrentUser()` decorator in `backend/src/shared-kernel/presentation/auth.guard.ts`
- [X] T059 Create `IdentityModule` binding every port token to its adapter in `backend/src/identity/identity.module.ts` and import it in `backend/src/app.module.ts`
- [X] T060 Create the e2e harness: Nest app built against `postgres-test`, migrations applied once, tables truncated between tests, `MailTransport` overridden with `InMemoryMailTransport`, Apple/Google verifiers and HIBP replaced by fakes, a `signUpAndLogin()` helper in `backend/test/support/e2e-app.ts`; update `backend/test/jest-e2e.json`

### Mobile shell

- [X] T061 [P] Set up i18next with `fr` (default) and `en`, initial language from `getLocales()` in `mobile/src/i18n/index.ts`, catalogs `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json` including an `errors.<CODE>` key for every code in T032
- [X] T062 [P] Implement secure storage helpers for `refresh_token` and `lock_settings` (`expo-secure-store`, never AsyncStorage) in `mobile/src/auth/secure-storage.ts`
- [X] T063 Implement the API client: base URL from config, attaches the in-memory access token, parses responses with `@two-cents/shared/contracts` schemas, turns error bodies into typed `ApiError(code)` in `mobile/src/auth/api-client.ts` with tests
- [X] T064 Implement the auth store (React context + reducer, states `signedOut | signedIn | locked | pendingDeletion`, holds `me` and the access token in memory) in `mobile/src/auth/auth-store.tsx` with tests
- [X] T065 Rewrite `mobile/src/app/_layout.tsx`: providers (QueryClient, i18n, auth store), splash until auth bootstrap finishes, `Stack.Protected` groups `(auth)` for signed-out, `(app)` for signed-in, `pending-deletion` for pending users; remove the template `explore.tsx` and demo components no longer used
- [X] T066 [P] Create shared form components (text field with label/error announced to screen readers, password field with show/hide, primary button with loading state, ≥ 44×44 pt, design tokens from `mobile/src/constants/theme.ts` only) in `mobile/src/components/form/`
- [X] T067 [P] Create `InvalidLinkScreen` ("This link is no longer valid" + action prop for "send a new one") in `mobile/src/components/invalid-link-screen.tsx`

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Create an account and reach an empty budget (Priority: P1) 🎯 MVP

**Goal**: Sign up with email + password, Apple or Google (with safe account linking) and land on the "create a budget / enter an invitation code" choice.

**Independent Test**: On a fresh install, create an account with each of the three methods and reach the onboarding choice (and an empty budget once spec 002 US1 is present); time the email path (< 60 s).

### Tests for User Story 1 ⚠️ (write first, see them fail)

- [X] T068 [P] [US1] e2e `backend/test/signup.e2e-spec.ts`: valid sign-up → 201 `AuthResult` with `emailConfirmed: false`; `Maelle@Example.com` when `maelle@example.com` exists → 409 `EMAIL_IN_USE`; 9-character password → 422 `PASSWORD_TOO_SHORT`; breached password (fake HIBP) → 422 `PASSWORD_BREACHED`; 11th sign-up in a minute from one IP → 429; first name `"Maëlle"` stored NFC
- [X] T069 [P] [US1] e2e `backend/test/provider-linking.e2e-spec.ts`: Apple first sign-in creates an account with `emailConfirmed: true` and stores the relay email + `is_private_relay`; second Apple sign-in with no email still finds the user by `sub`; Google sign-in with the email of an existing password account → 409 `LINK_REQUIRED { linkToken, emailHint }` and no identity row; `POST /auth/link/password` with correct password links and returns `AuthResult`, wrong password → 401; `POST /auth/link/email` sends a mail whose link token, used in `POST /auth/link/confirm`, links the identity; expired link token → 410 `LINK_EXPIRED`; invalid provider token → 401 `INVALID_PROVIDER_TOKEN`
- [X] T070 [P] [US1] Unit tests for `SignUp`, `SignInWithProvider`, `LinkIdentityWithPassword`, `RequestLinkByEmail`, `ConfirmLinkByEmail` use cases with fakes from T057 in `backend/src/identity/application/use-cases/*.spec.ts`

### Implementation for User Story 1

- [ ] T071 [US1] Before writing Apple code, check Apple's current docs in the Apple Developer portal for: identity-token claims, the `/auth/token` code exchange and client-secret JWT, `/auth/revoke`, server-to-server notification payload, and Private Email Relay sender registration; record confirmed details (or corrections) in research R8 of `specs/001-user-accounts/research.md`
- [X] T072 [P] [US1] Add zod schemas `SignUpRequest` (`email`, `password`, `firstName`, `locale`, `device`), `AppleSignInRequest` (`identityToken`, `authorizationCode`, `firstName?`, `locale`, `device`), `GoogleSignInRequest` (`idToken`, `locale`, `device`), `LinkRequiredError` (`linkToken`, `emailHint`), `LinkPasswordRequest`, `LinkEmailRequest`, `LinkConfirmRequest` in `packages/shared/src/contracts/auth.ts`
- [X] T073 [US1] Add Drizzle tables `auth_identities` (`provider` enum `apple` | `google`, `provider_subject`, `provider_email`, `is_private_relay` "boolean default false", `apple_refresh_token_enc` bytea, UNIQUE (`provider`, `provider_subject`), UNIQUE (`user_id`, `provider`), FK cascade) and `pending_links` (`link_token_hash` "UNIQUE", `expires_at` "now + 15 min", `completed_at`, `apple_refresh_token_enc`) to `backend/src/shared-kernel/infrastructure/db/schema/identity.ts`; generate the migration in `backend/drizzle/`
- [X] T074 [P] [US1] Implement entities `AuthIdentity` (`link`, `updateEmail(email, isRelay)`, `revokeConsent`) and `PendingLink` (`create`, `complete(now)`, `isExpired(now)`) in `backend/src/identity/domain/entities/` with specs; add `AuthIdentityRepository` and `PendingLinkRepository` ports in `backend/src/identity/domain/ports/`
- [X] T075 [US1] Implement Drizzle adapters for `AuthIdentityRepository` and `PendingLinkRepository` in `backend/src/identity/infrastructure/persistence/` with integration tests
- [X] T076 [P] [US1] Implement `HibpBreachedPasswordChecker` (SHA-1, send first 5 hex chars to `https://api.pwnedpasswords.com/range/{prefix}` with `Add-Padding: true`, 2 s timeout, compare suffixes locally ignoring count-0 padding rows; check a bundled top-10 000 list first; on timeout accept if not in the list and record `breach_check_unavailable`) in `backend/src/identity/infrastructure/security/hibp-breached-password-checker.ts`, list in `backend/src/identity/infrastructure/security/common-passwords.txt`, spec with mocked `fetch`
- [X] T077 [P] [US1] Implement `AesGcmSecretEncryptor` (`TOKEN_ENCRYPTION_KEY`, random 12-byte nonce stored with the ciphertext) in `backend/src/identity/infrastructure/security/aes-gcm-secret-encryptor.ts` with spec
- [X] T078 [P] [US1] Implement `JoseAppleTokenVerifier` (JWKS `https://appleid.apple.com/auth/keys`, `iss` `https://appleid.apple.com`, `aud` = `APPLE_BUNDLE_ID`, `exp`; normalise `email_verified` / `is_private_email` from strings) and `AppleAuthorizationCodeExchanger` (ES256 client-secret JWT from the `.p8` key; returns the refresh token) in `backend/src/identity/infrastructure/providers/apple/` with specs using a local JWKS
- [X] T079 [P] [US1] Implement `JoseGoogleTokenVerifier` (JWKS `https://www.googleapis.com/oauth2/v3/certs`, `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`}, `aud` = `GOOGLE_WEB_CLIENT_ID`, `exp`, returns `sub`, `email`, `email_verified`) in `backend/src/identity/infrastructure/providers/google/jose-google-token-verifier.ts` with spec
- [X] T080 [US1] Implement the `SignUp` use case (validate policy → breach check → reject existing normalized email with `EMAIL_IN_USE`, or `ACCOUNT_PENDING_DELETION` if that account is pending deletion → hash → `User.register` → `SessionIssuer` → `signup` security event, all inside `TransactionRunner.run`) in `backend/src/identity/application/use-cases/sign-up.ts`
- [X] T081 [US1] Implement the `SignInWithProvider` use case for Apple and Google (find identity by `(provider, sub)` → sign in; else if a user has the same normalized email → create `PendingLink` and throw `LINK_REQUIRED` with masked `emailHint`; else create user with `email_confirmed_at = now` and identity; store the encrypted Apple refresh token) in `backend/src/identity/application/use-cases/sign-in-with-provider.ts`
- [X] T082 [US1] Implement `LinkIdentityWithPassword` (verifies password with lockout rules from `User`, completes `PendingLink`, creates `AuthIdentity`, `identity_linked` event), `RequestLinkByEmail` (issues a `link_account` `EmailToken` tied to the pending link, sends `LinkAccountMail` after commit) and `ConfirmLinkByEmail` in `backend/src/identity/application/use-cases/`
- [X] T083 [P] [US1] Implement the `IdentityMailer` adapter with `@nestjs/mail` (`mailer.send` called after commit, `locale` option, failures recorded as security events without failing the request) and the `LinkAccountMail` class with templates `link-account.html` (fr) / `link-account.en.html` containing the provider name and the `${APP_LINK_BASE_URL}/l/link?t=<token>` link in `backend/src/identity/infrastructure/mail/`
- [X] T084 [US1] Implement `AuthController` routes `POST /v1/auth/signup`, `/auth/apple`, `/auth/google`, `/auth/link/password`, `/auth/link/email`, `/auth/link/confirm` with zod schemas from T072, `@AuthThrottle()` on each, mapping to use cases only, in `backend/src/identity/presentation/http/auth.controller.ts`
- [X] T085 [US1] Implement Apple server-to-server notifications: `HandleAppleNotification` use case (`consent-revoked` / `account-delete` → remove the Apple identity and revoke sessions whose `auth_method = apple` with reason `provider_revoked`; `email-disabled` / `email-enabled` → set `email_deliverable`) in `backend/src/identity/application/use-cases/handle-apple-notification.ts` and `POST /v1/auth/apple/notifications` (verifies the Apple-signed JWT) in `backend/src/identity/presentation/http/apple-notifications.controller.ts`, with an e2e case in `backend/test/provider-linking.e2e-spec.ts`
- [X] T086 [P] [US1] Build the welcome screen (app name, "Créer un compte", "Se connecter", Sign in with Apple button only on iOS via `AppleAuthenticationButton`, Google button) in `mobile/src/app/(auth)/welcome.tsx`
- [X] T087 [P] [US1] Build the sign-up screen (email, first name, password with live "10 caractères minimum" hint; server errors `EMAIL_IN_USE` with "Se connecter" / "Mot de passe oublié" actions, `PASSWORD_BREACHED`, `PASSWORD_TOO_SHORT`; haptic on success) in `mobile/src/app/(auth)/sign-up.tsx`
- [X] T088 [P] [US1] Implement `useAppleSignIn` (requests `FULL_NAME` and `EMAIL`, sends `identityToken`, `authorizationCode`, first name only on first sign-in; ignores `ERR_REQUEST_CANCELED`) and `useGoogleSignIn` (`@react-native-google-signin/google-signin` configured with the web client ID, sends `idToken`) in `mobile/src/auth/providers/`
- [X] T089 [US1] Build the link-account screen (shows `emailHint`, password option → `/auth/link/password`, "M'envoyer un lien" → `/auth/link/email` then "check your email" state) in `mobile/src/app/(auth)/link-account.tsx` and the link route `mobile/src/app/(links)/link.tsx` (reads `t`, calls `/auth/link/confirm`, signs in, `InvalidLinkScreen` on 410)
- [X] T090 [US1] Route signed-in users with `me.hasBudget === false` to `(app)/onboarding/choose`; if spec 002 has not created it yet, add a placeholder `mobile/src/app/(app)/onboarding/choose.tsx` with "Créer un budget" and "J'ai un code d'invitation" buttons (actions wired by spec 002)
- [X] T091 [US1] Add all US1 strings (fr, en) to `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json`

**Checkpoint**: Accounts can be created by all three methods and reach onboarding

---

## Phase 4: User Story 2 - Log in, stay logged in across devices, log out (Priority: P1)

**Goal**: Password login with lockout, silent token refresh, session restore on cold start, server-side logout.

**Independent Test**: Log in on two devices, use both over several days, confirm neither asks for the password; log out on one and confirm the other is unaffected.

### Tests for User Story 2 ⚠️

- [X] T092 [P] [US2] e2e `backend/test/login-sessions.e2e-spec.ts`: login with `  USER@example.com ` works; wrong email and wrong password both → 401 `INVALID_CREDENTIALS` with identical bodies; 5th consecutive failure → 423 `ACCOUNT_LOCKED` with `retryAfterSeconds` ≈ 900 and correct password still refused until then; success resets the counter; refresh rotates the token and the old one then revokes the session (`reuse_detected`); a session with `last_used_at` 90 days + 1 minute ago → 401 `SESSION_ENDED`; logout revokes server-side and the second device keeps working; `GET /v1/me` returns `Me`
- [X] T093 [P] [US2] Unit tests for `LogIn`, `RefreshSession`, `LogOut` use cases and `Session.rotate` in `backend/src/identity/application/use-cases/*.spec.ts` and `backend/src/identity/domain/entities/session.spec.ts`

### Implementation for User Story 2

- [X] T094 [P] [US2] Add zod schemas `LoginRequest` (`email`, `password`, `device`), `RefreshRequest`, `RefreshResponse` (`tokens`), `SessionEndedError` (`reason`) in `packages/shared/src/contracts/auth.ts`, and `MeResponse` in `packages/shared/src/contracts/me.ts`
- [X] T095 [P] [US2] Add `User.recordFailedLogin(now)` / `recordSuccessfulLogin()` / `isLockedOut(now)` (via shared `nextLockState`, `isLockedOut`) and `Session.rotate(presentedHash, newHash, now)` (re-use of `previous_refresh_token_hash` → revoke with `reuse_detected`) in `backend/src/identity/domain/entities/`
- [X] T096 [US2] Implement the `LogIn` use case (normalize email; unknown email still runs a dummy argon2 verify for equal timing; locked → `ACCOUNT_LOCKED`; wrong password → record failure, on the 5th send `AccountLockedMail` and record `account_locked`; success → rehash if `needsRehash`, `SessionIssuer`) in `backend/src/identity/application/use-cases/log-in.ts`
- [X] T097 [P] [US2] Implement `RefreshSession` (rotate, update `last_used_at`, `SESSION_ENDED` with reason when revoked/expired) and `LogOut` (revoke current with `logout`) use cases and `GetMe` query in `backend/src/identity/application/use-cases/`
- [X] T098 [P] [US2] Add `AccountLockedMail` with templates `account-locked.html` / `account-locked.en.html` (unlock time, password reset suggestion, no token) in `backend/src/identity/infrastructure/mail/`
- [X] T099 [US2] Add routes `POST /v1/auth/login` (`@AuthThrottle()`), `POST /v1/auth/refresh`, `POST /v1/auth/logout` (AuthGuard) to `backend/src/identity/presentation/http/auth.controller.ts` and `GET /v1/me` in `backend/src/identity/presentation/http/me.controller.ts`
- [X] T100 [US2] Add single-flight refresh to `mobile/src/auth/api-client.ts` (on 401 call `/auth/refresh` once for all waiting requests, store the new refresh token, retry; on `SESSION_ENDED` clear storage and sign out with a reason message) with tests
- [X] T101 [US2] Implement bootstrap on cold start (read refresh token → `/auth/refresh` → `GET /me`; offline → keep last cached `me` and show cached data) in `mobile/src/auth/bootstrap.ts` and call it from `mobile/src/app/_layout.tsx`
- [X] T102 [P] [US2] Build the login screen (email, password, "Mot de passe oublié ?" link, `ACCOUNT_LOCKED` message with retry time, `INVALID_CREDENTIALS` generic message, device name from `expo-device` such as "iPhone de Maëlle") in `mobile/src/app/(auth)/login.tsx`
- [X] T103 [P] [US2] Build the settings index with a "Se déconnecter" action (calls `/auth/logout`, clears secure storage) in `mobile/src/app/(app)/settings/index.tsx`
- [X] T104 [US2] Add US2 strings (fr, en), including the "session ended" explanations per `reason`, to `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json`

**Checkpoint**: US1 + US2 = a usable signed-in app (MVP)

---

## Phase 5: User Story 3 - Confirm email address (Priority: P2)

**Goal**: Email sign-ups receive a 24 h single-use confirmation link; sharing actions are blocked until confirmed.

**Independent Test**: Sign up by email, check invite/join actions are blocked, open the link, check they are unblocked.

### Tests for User Story 3 ⚠️

- [X] T105 [P] [US3] e2e `backend/test/email-confirmation.e2e-spec.ts`: sign-up sends a `ConfirmEmailMail` (read from `InMemoryMailTransport`); its token confirms once (`emailConfirmed: true`), second use → 410 `TOKEN_INVALID`; token older than 24 h → 410; resend supersedes the previous token; resend when confirmed → 409 `ALREADY_CONFIRMED`; resend rate-limited → 429; Apple/Google accounts are confirmed at creation
- [X] T106 [P] [US3] Unit tests for `ConfirmEmail` and `ResendConfirmation` in `backend/src/identity/application/use-cases/*.spec.ts`

### Implementation for User Story 3

- [X] T107 [P] [US3] Add `ConfirmEmailRequest` (`token`) and `ConfirmEmailResponse` (`me?`) schemas in `packages/shared/src/contracts/auth.ts`
- [X] T108 [US3] Implement the `EmailTokenIssuer` application service (supersede older tokens of the same purpose for the user, generate token, save hash with `emailTokenExpiry`) in `backend/src/identity/application/services/email-token-issuer.ts` with spec, and refactor `RequestLinkByEmail` (T082) to use it
- [X] T109 [US3] Implement `User.confirmEmail(now)`, the `ConfirmEmail` and `ResendConfirmation` use cases, and send `ConfirmEmailMail` from `SignUp` after commit, in `backend/src/identity/application/use-cases/`
- [X] T110 [P] [US3] Add `ConfirmEmailMail` with templates `confirm-email.html` / `confirm-email.en.html` (link `${APP_LINK_BASE_URL}/l/confirm?t=<token>`, "valable 24 h") in `backend/src/identity/infrastructure/mail/`
- [X] T111 [US3] Add routes `POST /v1/auth/email/confirm` and `POST /v1/auth/email/resend-confirmation` (AuthGuard, `@AuthThrottle()`) to `backend/src/identity/presentation/http/auth.controller.ts`
- [X] T112 [P] [US3] Serve `/.well-known/apple-app-site-association` (paths `/l/*`, `/i/*`) and `/.well-known/assetlinks.json` from `backend/src/shared-kernel/infrastructure/well-known/well-known.controller.ts`, outside the `v1` prefix, plus a static FR/EN "open the app" page for `/l/*` that never consumes the token
- [X] T113 [P] [US3] Build `mobile/src/app/(links)/confirm.tsx` (reads `t`, calls `/auth/email/confirm`, success state, `InvalidLinkScreen` with "Renvoyer l'e-mail" on 410)
- [X] T114 [P] [US3] Build the "email not confirmed" banner with "Renvoyer" (rate-limit message) in `mobile/src/components/unconfirmed-email-banner.tsx`, shown on the settings index and onboarding screen
- [X] T115 [US3] Add `requireConfirmedEmail()` guard hook (shows "Confirmez votre e-mail pour inviter ou rejoindre un budget" with resend) in `mobile/src/auth/require-confirmed-email.ts`, applied to the "J'ai un code d'invitation" action in `mobile/src/app/(app)/onboarding/choose.tsx` (spec 002 reuses it for invite actions; its API returns 403 `email_not_confirmed`)
- [X] T116 [US3] Add US3 strings (fr, en) to `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json`

**Checkpoint**: Email confirmation works and gates sharing

---

## Phase 6: User Story 4 - Reset a forgotten password (Priority: P2)

**Goal**: 1 h single-use reset link; reset ends other sessions and lifts lockout.

**Independent Test**: Request a reset, use the link once, try it again, try an expired one.

### Tests for User Story 4 ⚠️

- [X] T117 [P] [US4] e2e `backend/test/password-reset.e2e-spec.ts`: `POST /auth/password/forgot` → 202 with identical body for known and unknown emails, mail only for the known one; reset with a valid token → 204, old password fails, new works, all sessions revoked with `password_changed`, lockout cleared, `PasswordChangedMail` sent; same token again → 410; token older than 1 h → 410; older token after a newer request → 410; new password failing policy → 422; reset on an Apple-only account adds a password sign-in method
- [X] T118 [P] [US4] Unit tests for `RequestPasswordReset` and `CompletePasswordReset` in `backend/src/identity/application/use-cases/*.spec.ts`

### Implementation for User Story 4

- [X] T119 [P] [US4] Add `ForgotPasswordRequest` (`email`, `locale`) and `ResetPasswordRequest` (`token`, `newPassword`) schemas in `packages/shared/src/contracts/auth.ts`
- [X] T120 [US4] Add `User.changePassword(hash)` (sets hash, clears `failed_login_count` and `locked_until`) and implement `RequestPasswordReset` (silent when unknown; `password_reset_requested` event) and `CompletePasswordReset` (consume token, policy + breach check, hash, revoke all sessions `password_changed`, `password_reset` event, send `PasswordChangedMail` after commit) in `backend/src/identity/application/use-cases/`
- [X] T121 [P] [US4] Add `ResetPasswordMail` (`/l/reset?t=<token>`, "valable 1 h", "ignorez cet e-mail si ce n'est pas vous") and `PasswordChangedMail` (time, "all other devices were signed out") with fr/en templates in `backend/src/identity/infrastructure/mail/`
- [X] T122 [US4] Add routes `POST /v1/auth/password/forgot` (`@AuthThrottle()`, always 202) and `POST /v1/auth/password/reset` to `backend/src/identity/presentation/http/auth.controller.ts`
- [X] T123 [P] [US4] Build `mobile/src/app/(auth)/forgot-password.tsx` (email field, same confirmation message whatever the result)
- [X] T124 [P] [US4] Build `mobile/src/app/(links)/reset.tsx` (new password + policy hint, success → login screen, `InvalidLinkScreen` with "Demander un nouveau lien" on 410)
- [X] T125 [US4] Add US4 strings (fr, en) to `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json`

**Checkpoint**: Password reset works end to end

---

## Phase 7: User Story 5 - Unlock with Face ID / fingerprint (Priority: P2)

**Goal**: Optional biometric unlock per device, optional lock on every open (> 30 s in background), fallback to account password or provider — never the device passcode.

**Independent Test**: Enable the lock on a device with biometrics, background the app past 30 s, reopen, confirm the budget stays hidden until biometric success.

### Tests for User Story 5 ⚠️

- [X] T126 [P] [US5] e2e `backend/test/reauthenticate.e2e-spec.ts`: correct password → 200 `{ reauthToken, expiresAt }` (5 min); wrong password counts toward lockout; Apple/Google token of the same user works, of another user → 401; the reauth token works once and expires after 5 min
- [X] T127 [P] [US5] Mobile tests for the lock controller (cold start locks; 10 s background no lock; 40 s background locks; lock disabled never locks) in `mobile/src/lock/lock-controller.test.ts` and for the biometric marker (read returns `null` → biometric unlock disabled, fallback required) in `mobile/src/lock/biometric-marker.test.ts`

### Implementation for User Story 5

- [X] T128 [P] [US5] Add `ReauthenticateRequest` (`{ password }` | `{ provider: "apple", identityToken }` | `{ provider: "google", idToken }`) and `ReauthenticateResponse` (`reauthToken`, `expiresAt`) in `packages/shared/src/contracts/auth.ts`
- [X] T129 [US5] Implement the `Reauthenticate` use case (password via lockout rules, or provider token whose `sub` matches one of the user's identities; stores `reauth_token_hash` and `reauth_expires_at = now + 5 min` on the current session) and `Session.consumeReauthToken(hash, now)` in `backend/src/identity/application/use-cases/reauthenticate.ts` and `backend/src/identity/domain/entities/session.ts`
- [X] T130 [US5] Add route `POST /v1/auth/reauthenticate` (AuthGuard, `@AuthThrottle()`) to `backend/src/identity/presentation/http/auth.controller.ts`
- [ ] T131 [US5] On a physical Android device, check whether an `expo-secure-store` item stored with `requireAuthentication: true` can be read with the device PIN; if it can, implement the Android path with `LocalAuthentication.authenticateAsync({ disableDeviceFallback: true })` and keep the marker only for enrolment-change detection; record the result in research R11 of `specs/001-user-accounts/research.md`
- [X] T132 [US5] Implement the biometric marker (`enable()` writes a random value with `requireAuthentication: true`; `unlock()` reads it: value → success, `null` → enrolment changed → disable and return `fallbackRequired`, cancel/error → `failed`) in `mobile/src/lock/biometric-marker.ts`
- [X] T133 [US5] Implement the lock controller (`AppState` listener, records background time, calls shared `shouldLock`, sets auth store to `locked`) in `mobile/src/lock/lock-controller.ts`, mounted in `mobile/src/app/_layout.tsx`
- [X] T134 [US5] Build the lock overlay (full-screen, nothing behind it rendered; biometric prompt on show; fallback "Utiliser mon mot de passe" → password field → `/auth/reauthenticate`, or "Continuer avec Apple/Google" for provider accounts; never offers the device passcode; offline fallback explains a connection is needed; haptic on unlock) in `mobile/src/lock/lock-screen.tsx`
- [X] T135 [P] [US5] Implement app-switcher privacy (iOS `enableAppSwitcherProtectionAsync`, Android `preventScreenCaptureAsync` only while "require on every open" is on) in `mobile/src/lock/privacy-screen.ts`
- [X] T136 [US5] Build `mobile/src/app/(app)/settings/security.tsx` (toggle "Déverrouiller avec Face ID / empreinte" hidden with explanation when `canUseBiometricAuthentication()` is false; toggle "Exiger à chaque ouverture"; enabling requires a biometric check; settings saved per device in `lock_settings`)
- [X] T137 [US5] Add US5 strings (fr, en), including Face ID usage text, to `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json`

**Checkpoint**: Biometric lock works on iOS and Android physical devices

---

## Phase 8: User Story 6 - Edit my profile (Priority: P3)

**Goal**: Edit first name, avatar, color, language and preferred currency.

**Independent Test**: Change each field and confirm it persists across devices and app restarts.

### Tests for User Story 6 ⚠️

- [X] T138 [P] [US6] e2e `backend/test/profile.e2e-spec.ts`: `PATCH /v1/me` with `"Maëlle"` saves NFC; empty or whitespace-only first name → 400; 51 code points → 400; unknown `avatarKey`/`colorKey` → 400; `locale: "en"` saved; `currency: "eur"` → 400, `"USD"` saved; another user's token cannot change this profile
- [X] T139 [P] [US6] Unit test for `UpdateProfile` in `backend/src/identity/application/use-cases/update-profile.spec.ts`

### Implementation for User Story 6

- [X] T140 [P] [US6] Add `UpdateProfileRequest` (`Partial<{ firstName, avatarKey, colorKey, locale, currency }>`, at least one field) in `packages/shared/src/contracts/me.ts`
- [X] T141 [US6] Implement `User.updateProfile(...)` and the `UpdateProfile` use case in `backend/src/identity/domain/entities/user.ts` and `backend/src/identity/application/use-cases/update-profile.ts`
- [X] T142 [US6] Add route `PATCH /v1/me` to `backend/src/identity/presentation/http/me.controller.ts`
- [X] T143 [P] [US6] Build the avatar component (avatar key + initials on a color token, accessible label with the first name) in `mobile/src/components/avatar.tsx`
- [X] T144 [US6] Build `mobile/src/app/(app)/settings/profile.tsx` (first name, avatar and color pickers from the preset sets, language picker that calls `i18n.changeLanguage` immediately, currency picker defaulting to EUR with a note "devise proposée pour vos nouveaux budgets")
- [X] T145 [US6] Add US6 strings (fr, en) to `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json`

**Checkpoint**: Profile edits persist and show on all devices

---

## Phase 9: User Story 7 - Manage active sessions (Priority: P3)

**Goal**: List signed-in devices, end one, or end all others.

**Independent Test**: Sign in on three devices, log out all others from one, confirm the two others are signed out on their next action.

### Tests for User Story 7 ⚠️

- [X] T146 [P] [US7] e2e `backend/test/sessions.e2e-spec.ts`: `GET /v1/me/sessions` lists active sessions with `current: true` for the caller only; `DELETE /v1/me/sessions/:id` ends that session (next request from it → 401 `SESSION_ENDED`); deleting the current id → 400 `CANNOT_REVOKE_CURRENT`; another user's session id → 404; `POST /v1/me/sessions/revoke-others` returns `revokedCount` and leaves the caller signed in
- [X] T147 [P] [US7] Unit tests for `ListSessions`, `RevokeSession`, `RevokeOtherSessions` in `backend/src/identity/application/use-cases/*.spec.ts`

### Implementation for User Story 7

- [X] T148 [P] [US7] Add `SessionsResponse` (`sessions: Array<{ id, deviceName, platform, signedInAt, lastActiveAt, current }>`) and `RevokeOthersResponse` (`revokedCount`) in `packages/shared/src/contracts/me.ts`
- [X] T149 [US7] Implement `ListSessions`, `RevokeSession` (reason `revoked_by_user`, `session_revoked` event) and `RevokeOtherSessions` use cases in `backend/src/identity/application/use-cases/`
- [X] T150 [US7] Add routes `GET /v1/me/sessions`, `DELETE /v1/me/sessions/:id`, `POST /v1/me/sessions/revoke-others` in `backend/src/identity/presentation/http/sessions.controller.ts`
- [X] T151 [US7] Build `mobile/src/app/(app)/settings/sessions.tsx` (list with device, platform icon + text, sign-in and last activity dates in the user's locale, "Cet appareil" badge, per-row "Déconnecter", "Déconnecter tous les autres appareils" with confirmation sheet and haptic)
- [X] T152 [US7] Add US7 strings (fr, en) to `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json`

**Checkpoint**: Remote sign-out works

---

## Phase 10: User Story 8 - Export my data and delete my account (Priority: P3)

**Goal**: JSON + CSV export; in-app deletion with a 7-day grace period, cancellable, then permanent erasure with "former member" attribution.

**Independent Test**: Export and check the files; delete an account that is sole member of one budget and co-member of another, cancel within 7 days, delete again, run the finaliser after the date, check both budgets.

### Tests for User Story 8 ⚠️

- [X] T153 [P] [US8] e2e `backend/test/export-deletion.e2e-spec.ts` (export): `GET /v1/me/export` returns `application/zip` with `export.json`, `profile.csv`, `sign-in-methods.csv`, `sessions.csv`, `budgets.csv`, `entries.csv`; no password hash, token or token hash anywhere in the archive; second export within a minute → 429
- [X] T154 [P] [US8] e2e `backend/test/export-deletion.e2e-spec.ts` (deletion): `DELETE /v1/me` without `reauthToken` → 401 `REAUTH_REQUIRED`; with it → 202 `deletionScheduledAt` = now + 7 days, all sessions revoked (`account_deletion`), `DeletionScheduledMail` sent with a cancel link; signing in during grace returns `status: "pending_deletion"` and every route except `GET /me`, `POST /me/deletion/cancel`, `POST /auth/logout` → 403 `ACCOUNT_PENDING_DELETION`; `POST /me/deletion/cancel` restores `active`; cancel link works once; sign-up with the pending email → 409 `ACCOUNT_PENDING_DELETION`; after moving `deletion_scheduled_at` into the past and running the finaliser: user, identities, sessions and tokens gone, `security_events.user_id` NULL, `AccountDeletedMail` sent, Apple revoker called for Apple identities, budget port `finalizeMemberDeletion` called, the email can sign up again as a new user with no access to old data
- [X] T155 [P] [US8] Unit tests for `RequestDeletion`, `CancelDeletion`, `CancelDeletionByLink`, `FinalizeDeletion` (idempotent, port calls in one transaction, Apple revoke retried outside it) and `ExportData` in `backend/src/identity/application/use-cases/*.spec.ts`

### Implementation for User Story 8

- [X] T156 [P] [US8] Add `DeletionRequest` (`reauthToken`), `DeletionScheduledResponse` (`deletionScheduledAt`), `DeletionPreviewResponse` (`budgetsDeleted: Array<{ id, name }>`, `budgetsLeft: Array<{ id, name, newOwnerFirstName? }>`, `scheduledAt`), `CancelDeletionByLinkRequest` (`token`) and the export JSON schema (amounts as integer minor units + ISO currency + formatted string, entry author first name or "former member") in `packages/shared/src/contracts/me.ts`
- [X] T157 [US8] Implement `User.requestDeletion(now)` (status `pending_deletion`, `deletion_scheduled_at` via `computeDeletionDate`) and `User.cancelDeletion()` in `backend/src/identity/domain/entities/user.ts` with spec cases
- [X] T158 [US8] Implement `PreviewDeletion`, `RequestDeletion` (consumes the reauth token, revokes all sessions `account_deletion`, calls `BudgetMembershipPort.cancelInvitationsSentBy`, issues a `cancel_deletion` token valid until `deletion_scheduled_at`, `deletion_requested` event, sends `DeletionScheduledMail` after commit), `CancelDeletion` and `CancelDeletionByLink` (`deletion_cancelled` event) in `backend/src/identity/application/use-cases/`
- [X] T159 [US8] Implement `FinalizeDeletion` (per due user, one transaction: `BudgetMembershipPort.finalizeMemberDeletion(userId)`, delete identities, sessions, tokens and the user row, `account_deleted` event with NULL user; send `AccountDeletedMail` before erasing the address; then revoke the Apple refresh token outside the transaction with retries) in `backend/src/identity/application/use-cases/finalize-deletion.ts`
- [X] T160 [P] [US8] Implement `AppleTokenRevoker` (decrypts the stored refresh token, POSTs to Apple's revoke endpoint with the client-secret JWT, as confirmed in T071) in `backend/src/identity/infrastructure/providers/apple/apple-token-revoker.ts` with spec
- [X] T161 [P] [US8] Implement the finaliser job (`@Cron` every 15 minutes, PostgreSQL advisory lock so one instance runs it, calls `FinalizeDeletion`) in `backend/src/identity/infrastructure/jobs/finalize-deletions.job.ts`
- [X] T162 [US8] Restrict pending-deletion sessions in `AuthGuard`: when `status = pending_deletion`, allow only routes marked `@AllowPendingDeletion()` (`GET /me`, `POST /me/deletion/cancel`, `POST /auth/logout`), else 403 `ACCOUNT_PENDING_DELETION`, in `backend/src/shared-kernel/presentation/auth.guard.ts`
- [X] T163 [P] [US8] Implement `ExportData` (profile, sign-in methods without secrets, sessions, plus `BudgetExportPort.exportForUser`) and a `ZipExportBuilder` adapter (`fflate`, RFC 4180 CSV with UTF-8 BOM so Excel shows accents) in `backend/src/identity/application/use-cases/export-data.ts` and `backend/src/identity/infrastructure/export/zip-export-builder.ts`
- [X] T164 [P] [US8] Add `DeletionScheduledMail` (permanent date in the user's locale, `/l/cancel-deletion?t=<token>`) and `AccountDeletedMail` with fr/en templates in `backend/src/identity/infrastructure/mail/`
- [X] T165 [US8] Add routes `GET /v1/me/export` (throttle 1/min), `GET /v1/me/deletion/preview`, `DELETE /v1/me`, `POST /v1/me/deletion/cancel` (`@AllowPendingDeletion()`) and `POST /v1/me/deletion/cancel-by-link` in `backend/src/identity/presentation/http/me.controller.ts`
- [X] T166 [P] [US8] Build `mobile/src/app/(app)/settings/export.tsx` (download the ZIP with `expo-file-system` to the cache directory, open the share sheet with `expo-sharing`, progress and error states)
- [X] T167 [US8] Build `mobile/src/app/(app)/settings/delete-account.tsx` (preview of budgets deleted/left and the 7-day window, "Exporter d'abord" shortcut, re-authentication via password or Apple/Google → `reauthToken`, explicit "Supprimer mon compte" confirmation, then sign out to welcome)
- [X] T168 [P] [US8] Build `mobile/src/app/pending-deletion.tsx` (deletion date, "Annuler la suppression" → `/me/deletion/cancel`, "Se déconnecter") and `mobile/src/app/(links)/cancel-deletion.tsx` (reads `t`, calls `/me/deletion/cancel-by-link`, `InvalidLinkScreen` on 410)
- [X] T169 [US8] Add US8 strings (fr, en) to `mobile/src/i18n/fr.json` and `mobile/src/i18n/en.json`

**Checkpoint**: All user stories independently functional

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Privacy proofs, quality gates, success criteria

- [X] T170 [P] e2e `backend/test/privacy.e2e-spec.ts`: a second user's token gets 404/403 on every `/v1/me/*` route for the first user's resources; after running every flow, no column in any table contains a raw refresh token, access token, email-link token or password (scan values against tokens captured in the test); captured logs contain no `authorization` header, password, token or email value (SC-002, Principle III)
- [X] T171 [P] Add a route-coverage test that lists every controller route and fails if one lacks an e2e case for unauthenticated access (401) in `backend/test/route-coverage.e2e-spec.ts`
- [X] T172 [P] Export performance check: seed a household with 2 years of entries through the budget port test double and assert `GET /v1/me/export` completes in < 30 s (SC-008) in `backend/test/export-performance.e2e-spec.ts`
- [ ] T173 Accessibility pass on every 001 screen: labels on all controls, 44×44 pt targets, errors announced, lock screen announced, no color-only states; fix issues in the screen files under `mobile/src/app/`
- [ ] T174 Check every 001 screen in light and dark mode, at the largest font size, and with VoiceOver (iOS) or TalkBack (Android); fix layout issues in the screen files under `mobile/src/app/`
- [ ] T175 Run all 15 manual scenarios in `specs/001-user-accounts/quickstart.md` on physical iOS and Android devices; record timings for SC-001 (< 60 s) and SC-004 (< 3 s) in `specs/001-user-accounts/quickstart.md`
- [X] T176 Run `pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm --filter two-cents-backend test:e2e` and fix failures, including any layer-import violation reported by the rules from T007

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T001 first, then the rest (T004 after T001; T009 after T008)
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all user stories. Inside it: T013–T021 (tests) → T022–T030 → T031; T043 → T044 → T050; T049 + T051 → T056 → T058 → T059 → T060; T061–T064 → T065
- **User stories (Phase 3–10)**: all depend on Phase 2
- **Polish (Phase 11)**: after the stories you intend to ship

### User Story Dependencies

- **US1 (P1)**: after Phase 2. Reaching an actual empty budget needs spec 002 US1; without it US1 ends at the onboarding choice
- **US2 (P1)**: after Phase 2; independent of US1 for the backend (tests create users through the e2e helper); the mobile login screen is reachable from US1's welcome screen
- **US3 (P2)**: after Phase 2; T108 refactors US1's `RequestLinkByEmail` if US1 is done first
- **US4 (P2)**: after Phase 2; uses `EmailTokenIssuer` from US3 (T108) — do US3 first or move T108 earlier
- **US5 (P2)**: after Phase 2; provider fallback reuses US1's provider hooks (T088)
- **US6 (P3)**, **US7 (P3)**: after Phase 2, independent
- **US8 (P3)**: after Phase 2; the reauth token comes from US5 (T129) — do US5 first; uses `EmailTokenIssuer` (T108)

### Within Each User Story

- Test tasks first; confirm they fail
- Contracts → entities → repository adapters → use cases → controllers → mobile screens → strings
- Story complete (checkpoint) before the next priority

### Parallel Opportunities

- Phase 1: T002, T003, T005, T006, T008, T010, T011, T012 in parallel after T001
- Phase 2: the nine shared-rule tests T013–T021 together, then the nine implementations T022–T030 together; T034, T035, T037–T040, T042 together; T045–T049 together; T051–T055 together; T061, T062, T066, T067 together
- After Phase 2, US6 and US7 can run in parallel with US1–US2 (different files except the i18n catalogs and `me.controller.ts`/`auth.controller.ts`, which should be merged sequentially)

---

## Parallel Example: User Story 1

```bash
# Tests first, together:
Task: "e2e signup in backend/test/signup.e2e-spec.ts"
Task: "e2e provider linking in backend/test/provider-linking.e2e-spec.ts"
Task: "Unit tests for US1 use cases in backend/src/identity/application/use-cases/*.spec.ts"

# Independent adapters, together:
Task: "HibpBreachedPasswordChecker in backend/src/identity/infrastructure/security/hibp-breached-password-checker.ts"
Task: "AesGcmSecretEncryptor in backend/src/identity/infrastructure/security/aes-gcm-secret-encryptor.ts"
Task: "JoseAppleTokenVerifier in backend/src/identity/infrastructure/providers/apple/"
Task: "JoseGoogleTokenVerifier in backend/src/identity/infrastructure/providers/google/jose-google-token-verifier.ts"

# Mobile screens, together:
Task: "Welcome screen in mobile/src/app/(auth)/welcome.tsx"
Task: "Sign-up screen in mobile/src/app/(auth)/sign-up.tsx"
Task: "Provider hooks in mobile/src/auth/providers/"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 US1 (accounts by all three methods) → validate independently
3. Phase 4 US2 (login, sessions) → validate: a person can sign up, leave, come back, log out
4. **STOP and VALIDATE** with quickstart scenarios 1–5 and 7, then demo

### Incremental Delivery

1. MVP (US1 + US2)
2. US3 email confirmation (unblocks spec 002 invitations)
3. US4 password reset
4. US5 biometric lock (then US8 can use re-authentication)
5. US6 profile, US7 sessions (any order)
6. US8 export and deletion — required before public release (GDPR, App Store)
7. Phase 11 polish and quality gates

### With spec 002

Whichever feature starts first builds the shared Setup tasks (workspace, `packages/shared`, compose, Drizzle, mail). Spec 002 replaces the no-op budget ports (T055) with real adapters.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Commit per task or logical group, Conventional Commits with scope and issue, e.g. `feat(backend): add sign-up use case [#N]`
- Never log or store raw tokens; every token is hashed before it reaches a repository
- Use cases never throw HTTP exceptions; controllers never touch repositories
