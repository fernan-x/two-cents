# Research: User Accounts

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-16

Each entry: Decision, Rationale, Alternatives considered. Items marked **Verify on device** or **Verify in Apple portal** could not be fully confirmed from documentation and MUST be checked during implementation (tasks will include an explicit check).

---

## R1. Repository layout and the shared package

- **Decision**: Turn the repo into a pnpm workspace (`pnpm-workspace.yaml` at the root) with three packages: `backend/`, `mobile/`, and a new `packages/shared/` (`@two-cents/shared`). `shared` holds API schemas (`src/contracts/`) and pure domain functions (`src/domain/`), exported as two subpaths.
- **Rationale**: The constitution requires schemas and domain functions to be shared by backend and app, and says the first plan that needs them decides the location. One package is the smallest thing that satisfies both rules (Principle X).
- **Alternatives**: Two packages (`contracts`, `domain`): more config for no gain yet. Copying types into each app: forbidden by Principle VII.
- **Consequence**: `backend/dockerfile` must build from the repo root (`pnpm deploy --filter two-cents-backend --prod`) so the shared package is included and the image still contains no dev dependencies. The existing per-package lockfiles are replaced by one root `pnpm-lock.yaml`.

## R2. Database and data access

- **Decision**: PostgreSQL 18, accessed with **Drizzle ORM** (project owner's choice) and the `pg` driver, wired into NestJS with the official **`@nestjs/drizzle`** module (`DrizzleModule.forRoot`, `getDrizzleToken()`). Schema as TypeScript in `backend/src/db/schema/*.ts`; migrations generated with `drizzle-kit generate` into `backend/drizzle/`, committed as SQL, applied on deploy with `drizzle-kit migrate`.
- **Rationale**: SQL-first and typed, with no code-generation step and a small runtime. Partial indexes, `SELECT … FOR UPDATE` (`.for('update')`) and advisory locks (`sql` template) are native, so no raw-SQL escape hatches are needed. `@nestjs/outbox` (spec 002) plugs in with `fromDrizzle(db)`, and its tables can ship inside our own migrations (see below), giving one migration path.
- **Outbox migrations**: add `PostgresOutboxStore.migrationSql({ statementBreakpoints: true })` as a drizzle-kit custom migration (`drizzle-kit generate --custom`) and register the store with `migrate: false`, so the `nest_outbox` schema is created by the same `drizzle-kit migrate` step. Tell drizzle-kit to manage only `public` (`schemaFilter: ['public']`) so it never tries to drop `nest_outbox`.
- **Version risk**: `@nestjs/drizzle` is 0.0.x (first published 2026-09-23) — pin the exact version; it is a thin provider wrapper and can be replaced by a 10-line custom provider if needed.
- **Alternatives**: Prisma (chosen earlier, then dropped by the project owner: generated client and build step, raw SQL for row locks and partial indexes; note it also works with `@nestjs/outbox` via `fromPrisma`, so outbox compatibility was not the deciding factor); TypeORM (decorator-heavy, weaker types); MikroORM (more abstraction than needed).
- **Note**: Choosing the database is a core-stack decision; recording it here satisfies the constitution's "first plan decides". Later changes need an amendment.

## R3. Schema validation at the API boundary

- **Decision**: zod 4 schemas in `@two-cents/shared/contracts`; a small `ZodValidationPipe` in the backend validates every body/query/param; the mobile API client parses responses with the same schemas.
- **Rationale**: One definition, used at runtime on both sides (Principle VII). 4xx on invalid input is automatic.
- **Alternatives**: class-validator DTOs (backend-only, duplicates types for the app); OpenAPI codegen (extra toolchain).

## R4. Password storage and the breached-password check

- **Decision**: argon2id (`argon2` package) with OWASP parameters (memory 19 MiB, 2 iterations, parallelism 1), re-hash on login when parameters change. Breach check: Have I Been Pwned range API — send the first 5 hex chars of the SHA-1, with `Add-Padding: true`, compare suffixes locally; plus a bundled list of the 10 000 most common passwords checked first. If HIBP is unreachable (2 s timeout), accept the password if it passes the local list and record a security event.
- **Rationale**: argon2id is the current OWASP first choice. The range API only sends a 5-character hash prefix, so the password never leaves the server in a recoverable form (FR-004). No API key or stated rate limit for Pwned Passwords. Failing open on outage avoids blocking sign-up (SC-001) while the local list still catches the worst passwords.
- **Alternatives**: bcrypt (72-byte limit, weaker against GPUs); scrypt (fine, less tooling); a full local breach list (tens of GB).

## R5. Sessions and tokens

- **Decision**:
  - One **session** row per signed-in device.
  - **Access token**: JWT (HS256, server secret from env), 15 minutes, claims `sub` (user id) and `sid` (session id). An auth guard checks on every request that the session is still active (one primary-key lookup).
  - **Refresh token**: 256-bit random opaque value, only its SHA-256 hash stored, rotated on every refresh. Re-use of an already-rotated refresh token revokes the whole session (theft detection).
  - **Idle expiry**: a session whose `last_used_at` is older than 90 days is expired (domain function `isSessionExpired`).
  - **Device storage**: refresh token in `expo-secure-store`; access token in memory only.
- **Rationale**: Silent refresh (FR-021), immediate revocation at the next request (SC-006, which pure JWTs cannot do), nothing stored in plain text (SC-002, FR-051). SHA-256 is enough for high-entropy random tokens; slow hashing is only needed for passwords.
- **Alternatives**: Opaque access tokens only (one more table lookup per request, similar cost; JWT kept for the cheap expiry check). Passport/`@nestjs/passport`: unnecessary layer for 3 strategies.

## R6. Single-use email links (confirmation, reset, account linking, deletion cancel)

- **Decision**: One `email_tokens` table with a `purpose` column. Token = 256-bit random, SHA-256 hash stored, `expires_at`, `used_at`. Expiries: confirm 24 h, reset 1 h, link-account 1 h, cancel-deletion until the scheduled deletion date. Issuing a new token of the same purpose for the same user invalidates older unused ones.
- **Links**: `https://<app-domain>/l/<purpose>?t=<token>` as iOS Universal Links / Android App Links, opening Expo Router routes. In development, the `twocents://` scheme. If the app is not installed, the domain serves a short page telling the user to install/open the app.
- **Rationale**: Covers FR-010, FR-031, FR-007, FR-041b with one mechanism. Universal links avoid the "open in browser" dead end on mobile.
- **Open item**: the production app domain is not chosen yet; the plan uses `APP_LINK_BASE_URL` from env.

## R7. Login throttling and lockout

- **Decision**: `@nestjs/throttler` for per-IP limits on `/auth/*` (e.g. 10 requests/min on login, sign-up and reset-request). Per-account lockout persisted on the user row (`failed_login_count`, `locked_until`): 5 consecutive failures → 15 min; reset on success or password reset.
- **Rationale**: FR-005, FR-006a. Persisting lockout in the database survives restarts; the per-IP throttler can stay in memory while the backend runs as a single instance.
- **Alternatives**: Redis-backed throttling — needed only with several backend instances; deferred (Principle X), noted in Complexity Tracking as not taken.

## R8. Sign in with Apple

- **Decision**:
  - App: `expo-apple-authentication` (iOS only). Store `user`, `email` and `fullName` on first sign-in — Apple only sends email/name the first time.
  - Server: verify `identityToken` with `jose` against `https://appleid.apple.com/auth/keys` (`iss` = `https://appleid.apple.com`, `aud` = bundle ID, `exp`). Normalise `email_verified` / `is_private_email` (may arrive as strings). Identify the user by `sub`.
  - Exchange `authorizationCode` at Apple's token endpoint to obtain a refresh token; store it **encrypted** (AES-256-GCM, key from env). On permanent account deletion, revoke it via Apple's revoke endpoint (Apple's account-deletion guidance says apps "should" revoke tokens). Client secret = ES256 JWT signed with the `.p8` key.
  - Server-to-server notifications endpoint (`POST /auth/apple/notifications`): verify the signed JWT; on `consent-revoked` / `account-delete`, remove the Apple identity and end sessions created with it; on `email-disabled` / `email-enabled`, update a flag used before sending email.
  - Private Email Relay: register the sending domain and addresses in the Apple Developer portal and configure SPF + DKIM, otherwise mail to `@privaterelay.appleid.com` is rejected.
- **Verify in Apple portal**: Apple's docs pages could not be fetched (client-side rendered). Token-endpoint parameters, revoke endpoint parameters, and notification payload format above are from prior knowledge and MUST be checked against the Apple Developer documentation before implementation.
- **Android**: Sign in with Apple is not offered on Android in v1 (Apple users on Android can use email + password via reset). Confirmed by the project owner; recorded in the spec's Assumptions.

## R9. Sign in with Google

- **Decision**: `@react-native-google-signin/google-signin` (free tier) with its Expo config plugin; requires a development build. Server verifies the ID token with `jose` against `https://www.googleapis.com/oauth2/v3/certs`, `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`}, `aud` = the **web** client ID, `exp`. Identify by `sub`.
- **Rationale**: Named by Expo's Google authentication guide; the `expo-auth-session` Google provider is not recommended for native. Email is treated as confirmed when `email_verified` is true (FR-012); linking to an existing account still requires proof of ownership (FR-007), so Google's "authoritative only for gmail/Workspace" caveat cannot be abused.
- **Alternatives**: `react-native-nitro-google-signin` (newer, Credential Manager on Android; smaller ecosystem — revisit if the legacy Android SDK is removed).

## R10. Account linking (provider email already has an account)

- **Decision**: A provider sign-in whose verified email matches an existing account that lacks this provider returns `409 LINK_REQUIRED` with a short-lived `linkToken` (server-side `pending_links` row holding the verified provider identity, 15 min). The app then offers: (a) enter that account's password → `POST /auth/link/password`; or (b) "send me a link" → email with a `link-account` token; opening it completes the link and signs the user in.
- **Rationale**: FR-007 and edge cases. The provider identity is never attached before proof.

## R11. Biometric lock

- **Decision**:
  - At enable time: write a random marker into `expo-secure-store` with `requireAuthentication: true` (iOS `biometryCurrentSet`, Android `setUserAuthenticationRequired`).
  - Unlock = read the marker. Success → unlocked. `null` → enrolment changed (keys are invalidated on biometric changes) → disable biometric unlock and require the fallback (FR-038). Cancel/failure → show fallback.
  - Fallback (FR-037): password → `POST /auth/reauthenticate`; Apple/Google → native sign-in, then the same endpoint with the provider token. The device passcode is never offered (`disableDeviceFallback: true` where `expo-local-authentication` is used for capability checks).
  - Lock trigger: `AppState` — lock on cold start and when returning after > 30 s in background (domain function `shouldLock(backgroundedAt, now, settings)`).
  - App-switcher privacy: `expo-screen-capture` `enableAppSwitcherProtectionAsync` on iOS; on Android `preventScreenCaptureAsync` (FLAG_SECURE) only while "require on every open" is enabled.
  - Face ID usage text via the `expo-local-authentication` config plugin `faceIDPermission` (French + English through `locales` in app config).
- **Verify on device**: (1) on Android, whether `requireAuthentication` keys accept the device PIN — if so, switch Android unlock to `LocalAuthentication.authenticateAsync({ disableDeviceFallback: true })` and keep the marker only for enrolment-change detection; (2) iOS returns `null` (not an error) after enrolment change, as documented.
- **Offline**: biometric unlock works offline; the password fallback needs a connection (stated in the UI).

## R12. Account deletion with 7-day grace

- **Decision**: `DELETE /me` (after re-auth) sets `status = pending_deletion`, `deletion_scheduled_at = now + 7 days`, ends all sessions, cancels pending invitations (via the budgets module), sends the cancel email. A `@nestjs/schedule` job every 15 minutes finalises due accounts in one transaction: budgets module removes memberships / deletes sole-member budgets / transfers ownership; entries' author set to NULL ("former member"); personal data, identities, sessions and tokens deleted; Apple refresh token revoked (outside the transaction, retried). Signing in during the grace period offers "cancel deletion" before anything else.
- **Cross-feature rule (spec 002)**: if the deleting user **owns** a budget that has other members, ownership transfers automatically at finalisation to the longest-standing Admin, else the longest-standing member. Spec 002 forbids an owner from *leaving* without transferring; account deletion is a different path and must still complete in one flow (SC-003). Recorded in spec 002's edge cases.
- **"Former member" vs 002's "former member" label**: in 002, a member who *leaves* keeps their name with a "former member" label; after *account deletion* the name is erased and only "former member" is shown (personal data is gone).
- **Rationale**: FR-041–FR-043, GDPR erasure, Principle I traceability (audit rows keep a NULL actor = former member).

## R13. Data export

- **Decision**: `GET /me/export` streams a ZIP built with `fflate`: `export.json` (full structure) + `profile.csv`, `sessions.csv`, `sign-in-methods.csv`, `budgets.csv`, `entries.csv`. Amounts exported as integer minor units **and** a formatted decimal string column with the currency (Principle I: no floats). The app downloads with `expo-file-system` and opens the share sheet with `expo-sharing`. Budget/entry sections are provided by the budgets module through an export port (empty until 002 ships).
- **Rationale**: FR-040, SC-008. One request, files ready to save or share.
- **Alternatives**: emailing the export (slower, sends financial data through email); generating CSV on the device (duplicates logic).

## R14. Email delivery

- **Decision**: **`@nestjs/mail`** (official NestJS package), shared with spec 002 (its research R9). `SmtpTransport` to Brevo's SMTP relay (EU-hosted) in production and Mailpit in development (Docker Compose); one mail class per email in [contracts/deep-links.md](./contracts/deep-links.md#emails); `.html` templates with auto-escaping, French base file plus `.en.html`, chosen with the `locale` send option (FR-053). e2e tests override the transport with `InMemoryMailTransport` and read the link out of the sent mail. Configured in `backend/src/shared-kernel/infrastructure/mail/`, with each context's mail classes in its own `infrastructure/`; whichever feature is implemented first builds it.
- **Sent directly, not through `@nestjs/outbox`**: every 001 email either carries a secret single-use link (confirm, reset, link-account, cancel-deletion) or concerns account security/erasure. An outbox payload would store the raw token, or the email address of an erased account, in the database, which breaks FR-051 / SC-002 and GDPR erasure. So 001 calls `mailer.send()` **after** the transaction commits, using the package's built-in retries (3 attempts, 1–30 s backoff). If it still fails, a `security_events` row is written and the user can use "resend" (confirm, reset, link) — the API call itself still succeeds. Spec 002's notifications, which carry no secrets, use the outbox.
- **Version risk**: `@nestjs/mail` is 0.0.x (first published 2026-09-29); pin the exact version.
- **Rationale**: GDPR (EU processing), Apple relay compatibility (needs SPF/DKIM on our own domain), one mail module for the whole backend, no template engine or SMTP library to own.
- **Alternatives**: `nodemailer` + hand-written templates (more code); `@nestjs-modules/mailer` (community, pulls template engines); routing 001 emails through the outbox with an encrypted token (extra crypto for little gain).

## R15. Internationalisation and formatting

- **Decision**: Mobile: `i18next` + `react-i18next` + `expo-localization` (`getLocales()` for the default language). Backend: email strings in the same key structure. Supported: `fr` (default), `en`.
- **Rationale**: Principle VI.

## R16. Mobile data fetching and auth state

- **Decision**: TanStack Query for server state; a small `authStore` (React context + reducer) for session state (`signedOut | signedIn | locked | pendingDeletion`); an API client wrapper that attaches the access token and performs single-flight refresh on 401. Expo Router protected groups: `(auth)` for signed-out screens, `(app)` for signed-in, `onboarding` for users without a budget.
- **Rationale**: Standard Expo Router pattern; one place handles refresh and revocation (session revoked → sign-in screen with explanation).

## R17. Logging and security events

- **Decision**: `nestjs-pino` with redaction of `authorization`, `cookie`, `password`, `*.token`, `email`. A `security_events` table stores FR-052 events (type, user id, session id, IP hash, user-agent family, timestamp) — no emails, tokens or amounts.
- **Rationale**: Principle III (logs without personal data) and FR-052.

## R18. Testing

- **Decision**: `shared`: Jest unit tests, written first (Principle II) for domain functions. Backend: Jest unit + Supertest e2e against a real PostgreSQL (Docker Compose `postgres-test`), with HIBP, Apple and Google verification behind interfaces faked in e2e. Mobile: `jest-expo` + React Native Testing Library for the auth store, lock logic and forms. Device checks (biometrics, Apple/Google sign-in, universal links) are listed in `quickstart.md` as manual steps.
- **Alternatives**: Testcontainers (nicer isolation, slower CI start); Maestro for E2E (useful later; not justified yet).

## R19. Backend architecture: clean architecture (ports & adapters)

- **Decision** (project owner's requirement, applies to spec 002 too): each backend bounded context — `identity` (this feature) and `budgets` (002) — is split into four layers, plus a `shared-kernel` for cross-cutting pieces.

  | Layer | Contains | May import |
  |---|---|---|
  | `domain/` | Entities, value objects, domain errors, repository ports (interfaces) | `@two-cents/shared/domain` only — no NestJS, no Drizzle, no Node I/O |
  | `application/` | One class per use case, plus ports for external services (hasher, breach checker, provider verifiers, mailer, clock, transactions, other contexts) | `domain/`, `@two-cents/shared`, and only the `Injectable`/`Inject` decorators from `@nestjs/common` |
  | `infrastructure/` | Adapters implementing the ports: Drizzle repositories + row↔entity mappers, argon2, HIBP, jose, `@nestjs/mail`, `@nestjs/outbox`, jobs | anything |
  | `presentation/` | HTTP controllers, guards, request/response mapping with the zod contracts | `application/` (use cases) and `@two-cents/shared/contracts`; never repositories or Drizzle |

- **Wiring**: each context's Nest module (`identity.module.ts`) binds every port token to its adapter. Use cases receive ports by constructor injection, so tests swap adapters without Nest.
- **Entities vs shared rules**: entities hold state and enforce invariants (e.g. `User.recordFailedLogin(now)`, `Session.rotate(...)`), but the rules themselves stay in `@two-cents/shared/domain` (lockout, idle expiry, token validity…) and are called by the entities. This keeps Principle II: the app and the backend run the same rule code.
- **Transactions**: an application port `TransactionRunner.run(work)`. Its Drizzle adapter opens `db.transaction()` and stores `tx` in an `AsyncLocalStorage`; repositories and the outbox publisher pick up the current `tx` automatically. Use cases decide transaction boundaries; adapters never open their own.
- **Errors**: domain/application errors carry the stable codes from [contracts/api.md](./contracts/api.md); one presentation-layer exception filter maps them to HTTP statuses. Use cases never throw HTTP exceptions.
- **Cross-context calls**: `identity` reaches `budgets` only through application ports it owns (`BudgetMembershipPort`, `BudgetExportPort` — see data-model "Ports to the budgets module"); `budgets/infrastructure` implements them by calling budgets use cases. No context imports another context's repositories or tables.
- **Enforcement**: ESLint `no-restricted-imports` overrides per layer folder (no new dependency). A layer violation fails `pnpm lint`.
- **Testing**: entities and value objects — unit tests; use cases — unit tests with in-memory fakes of every port (no database, fast); infrastructure adapters — integration tests against `postgres-test`; HTTP — Supertest e2e with real adapters (external providers faked).
- **Rationale**: many external integrations (Apple, Google, HIBP, SMTP, outbox) and security rules that must be tested without a database or network; the dependency rule keeps Drizzle and NestJS replaceable.
- **Alternatives**: Nest services calling Drizzle directly (less code, but rules coupled to the ORM and tests need a database — rejected by the project owner); full CQRS / event sourcing (far more than needed).

## R20. Verified package APIs (implementation, T012)

- **ESM**: NestJS 12, `@nestjs/drizzle`, `@nestjs/mail`, `jose` and `uuid` are ESM-only. The backend stays CommonJS and loads them through Node 24's `require(esm)`; Jest runs with `--experimental-vm-modules` (already set up by the NestJS 12 upgrade).
- **`@nestjs/drizzle` 0.0.2**: `DrizzleModule.forRoot({ drizzle, connection })` or `forRootAsync`, injection with `@InjectDrizzle()` / `getDrizzleToken()`; it closes the pool on shutdown and attaches a pool `error` listener. Matches R2.
- **`@nestjs/mail` 0.0.2**: `MailModule.forRoot({ transport, from, retry })`; `SmtpTransport({ url })`; mail classes implement `Mailable<TData>` with `render(data, { locale, to })` returning `{ subject, html, text }`; `Mailer.send(MailClass, { to, data, locale })`; tests use `InMemoryMailTransport` (`assertSent`, `find`, `SentMail.link(match)`). **Change from R14**: templates are written inline with the package's auto-escaping `html` tagged template plus a per-locale string table, instead of `.html` files — same escaping, no template files to copy into the build.
