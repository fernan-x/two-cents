# Implementation Plan: User Accounts

**Branch**: `001-user-accounts` (spec directory; current git branch is `chore/expo-mobile-app`) | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-user-accounts/spec.md`

## Summary

Personal accounts for Two Cents: sign-up/sign-in with email + password, Sign in with Apple and Sign in with Google; email confirmation gating budget sharing; multi-device sessions with silent refresh and remote revocation; single-use password reset; biometric app lock without device-passcode fallback; profile; JSON/CSV export; in-app account deletion with a 7-day grace period.

Technical approach (details in [research.md](./research.md)): the repo becomes a pnpm workspace with a new `packages/shared` holding zod API schemas and pure domain rules. The NestJS backend gets PostgreSQL (Drizzle), argon2id passwords, a short-lived JWT access token checked against a `sessions` table on each request plus a rotating opaque refresh token (only hashes stored), provider-token verification with `jose`, and hashed single-use email tokens. The Expo app adds secure-store-backed session handling, Apple/Google native sign-in, a biometric lock built on a biometric-bound secure-store marker, and i18next. The backend follows clean architecture (research R19): entities and repository ports in `domain/`, one use case per action in `application/`, Drizzle/argon2/jose/mail adapters in `infrastructure/`, controllers in `presentation/`. Budget-side effects (onboarding check, deletion, export) go through ports implemented by spec 002.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict) on Node.js 24.9+ (backend, shared); React Native 0.88 / Expo SDK 58 (mobile).

**Primary Dependencies**:
- Backend: NestJS 12, Drizzle ORM (drizzle-orm, drizzle-kit, pg, @nestjs/drizzle), zod 4, argon2, jose, @nestjs/throttler, @nestjs/schedule, nestjs-pino, @nestjs/mail, fflate.
- Mobile: expo-router, expo-secure-store, expo-local-authentication, expo-apple-authentication, @react-native-google-signin/google-signin, expo-screen-capture, expo-localization, expo-file-system, expo-sharing, @tanstack/react-query, i18next + react-i18next.
- Shared: zod 4.

**Storage**: PostgreSQL 18 (server); expo-secure-store (Keychain/Keystore) on device for the refresh token and lock settings.

**Testing**: Jest (shared unit, backend unit), Jest + Supertest e2e against real PostgreSQL (backend), jest-expo + React Native Testing Library (mobile); manual device checks in [quickstart.md](./quickstart.md).

**Target Platform**: iOS 17+ and Android 10+ (API 29+) via EAS development/production builds; backend as a Linux container.

**Project Type**: Mobile app + API (pnpm monorepo).

**Performance Goals**: install → empty budget < 60 s (SC-001); biometric unlock → budget < 3 s (SC-004); export of 2 years of entries < 30 s (SC-008); auth endpoints p95 < 300 ms excluding argon2 verification (~50–100 ms by design).

**Constraints**: no plain-text passwords or tokens anywhere (SC-002); logs without personal data; GDPR erasure after 7-day grace; works offline for already-signed-in users (cached data behind biometric lock).

**Scale/Scope**: households of 2–6 people; initial target < 10 000 users; single backend instance (in-memory per-IP throttling acceptable, lockout persisted in DB). ~14 mobile screens, ~25 endpoints.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|---|---|---|
| I | Money is always exact | ✅ | Only touch point is export: amounts exported as integer minor units + ISO currency + formatted string; no floats. Preferred currency stored as ISO 4217 code. Traceability: entries keep a NULL author ("former member") instead of being rewritten; `security_events` audit. |
| II | Calculations tested first | ✅ | No financial calculations here. Auth rules that behave like calculations (lockout, idle expiry, token validity, deletion date, lock timing, owner pick) are pure functions in `@two-cents/shared/domain`, unit-tested first. |
| III | Privacy by default | ✅ | Every `/me/*` route scoped to the token's user, with an e2e test that another user is refused. Export + in-app deletion delivered. Refresh token in expo-secure-store, access token in memory. Server secrets from env. Passwords argon2id; all tokens stored as SHA-256 hashes; Apple refresh token encrypted. Logs redact auth headers, passwords, tokens, emails; `security_events` stores no personal data beyond user id. No bank credentials. |
| IV | Mobile-first & native-feeling | ✅ | Native Apple/Google sign-in buttons, platform stacks and sheets, safe areas, Dynamic Type, dark mode, haptics on success (sign-in, unlock, deletion scheduled). **Transaction-recording budget (< 10 s)**: the biometric lock is the only thing added to the "open app → record" path; it costs one biometric prompt (~1 s), not shown at all when reopening within 30 s; SC-004 caps it at 3 s. |
| V | One design system | ✅ | All screens built from the existing tokens in `mobile/src/constants/theme.ts` and shared components; avatar colors are design tokens (`color_key`). No amounts displayed in this feature. |
| VI | French first, i18n-ready | ✅ | i18next with `fr` (default) and `en`; error codes from the API mapped to translation keys; emails rendered per user locale; Face ID usage text localized. |
| VII | Contract-first API | ✅ | zod schemas in `packages/shared/src/contracts`, consumed by backend pipe and mobile client; 400 on invalid input; `/v1` prefix for versioning; strict TS everywhere. |
| VIII | Accessible | ✅ | Labels and ≥ 44×44 pt targets on all controls; lock screen and errors announced to screen readers; lockout/error states shown with text + icon, never color alone; WCAG AA contrast via tokens. |
| IX | AI optional & explainable | ✅ N/A | No AI in this feature. |
| X | Simplicity | ✅ (justified) | One shared package (not two); no Redis, no Passport, no template engine; single `email_tokens` table for all link purposes. New dependencies justified below. The clean-architecture layers are a new abstraction, justified in Complexity Tracking. |

**Gate result (pre-research)**: PASS. **Gate result (post-design)**: PASS — the data model, contracts and quickstart introduce no violations.

### New dependencies (Principle X justification)

| Dependency | Why needed | Simpler alternative rejected |
|---|---|---|
| drizzle-orm, drizzle-kit, pg, @nestjs/drizzle (pinned, 0.0.x) | First persistence layer; typed SQL-first queries + SQL migrations, official Nest wiring (project owner's choice) | Raw `pg` + hand-written migrations: no typing, more code |
| zod | Shared runtime schemas (Principle VII) | TS types only: no runtime validation |
| argon2 | Password hashing (FR-050) | Node `crypto.scrypt`: acceptable but weaker tooling and parameter guidance |
| jose | Verify Apple/Google JWTs via JWKS, sign access tokens | Provider SDKs: two heavier libraries for one job |
| @nestjs/throttler | Per-IP rate limits (FR-005, FR-006a) | Hand-written limiter: reinventing |
| @nestjs/schedule | Deletion finaliser job | External cron: extra infrastructure |
| nestjs-pino | Structured logs with redaction (Principle III) | Default Nest logger: no redaction |
| @nestjs/mail (pinned, 0.0.x) | Official NestJS mail module: SMTP, escaped templates, locales, retries, in-memory test transport; no third-party deps | nodemailer + hand-written templates: more code to own |
| fflate | ZIP export | archiver: larger, stream-heavy |
| expo-secure-store, expo-local-authentication, expo-apple-authentication, expo-screen-capture, expo-localization, expo-file-system, expo-sharing | Expo SDK modules for required native capabilities (constitution: Expo first) | — |
| @react-native-google-signin/google-signin | Native Google sign-in recommended by Expo docs | expo-auth-session Google provider: not recommended for native |
| @tanstack/react-query | Server state, retries, cache for offline reading | Hand-rolled fetch state: more code, more bugs |
| i18next, react-i18next | Translation layer (Principle VI) | Custom dictionary: no plurals/interpolation |

## Project Structure

### Documentation (this feature)

```text
specs/001-user-accounts/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R18
├── data-model.md        # Phase 1: tables, states, ports, domain functions
├── quickstart.md        # Phase 1: setup + validation scenarios
├── contracts/
│   ├── api.md           # REST endpoints, payloads, error codes
│   └── deep-links.md    # Email links, app routes, email list
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
pnpm-workspace.yaml                 # NEW: backend, mobile, packages/*
pnpm-lock.yaml                      # NEW: single root lockfile (replaces per-package ones)
docker-compose.yml                  # NEW: postgres, postgres-test, mailpit
.node-version                       # NEW: 24.9 (constitution)

packages/shared/                    # NEW: @two-cents/shared
├── src/contracts/                  # zod schemas: auth.ts, me.ts, errors.ts
├── src/domain/                     # email.ts, password-policy.ts, lockout.ts, session.ts,
│                                   # email-token.ts, deletion.ts, app-lock.ts, ownership.ts
└── test/                           # unit tests per domain file (written first)

backend/
├── dockerfile                      # CHANGED: build from repo root with pnpm deploy
├── drizzle.config.ts               # drizzle-kit config (schemaFilter: public)
├── drizzle/                        # committed SQL migrations (incl. custom migration for nest_outbox)
├── src/
│   ├── shared-kernel/              # shared with 002
│   │   ├── domain/                 # DomainError (stable codes), ids
│   │   ├── application/            # Clock, TransactionRunner, IdGenerator ports
│   │   ├── infrastructure/         # DrizzleModule setup, AsyncLocalStorage TransactionRunner, system clock, uuidv7
│   │   │   ├── db/schema/*.ts      # all Drizzle tables (identity + budgets)
│   │   │   ├── mail/               # MailModule (@nestjs/mail, SMTP) config; 002 adds @nestjs/outbox here
│   │   │   └── well-known/         # AASA + assetlinks for universal/app links
│   │   └── presentation/           # ZodValidationPipe, AuthGuard ({ userId, sessionId, emailConfirmed, firstName } — contract for 002 R4), DomainError→HTTP filter
│   ├── identity/                   # THIS FEATURE
│   │   ├── domain/
│   │   │   ├── entities/           # user, session, auth-identity, email-token, pending-link
│   │   │   ├── value-objects/      # email, first-name, plain-password, locale, currency-code
│   │   │   └── ports/              # repository interfaces, SecurityEventLog
│   │   ├── application/
│   │   │   ├── ports/              # PasswordHasher, BreachedPasswordChecker, token/crypto, provider verifiers, IdentityMailer, Budget*Port
│   │   │   └── use-cases/          # sign-up, log-in, sign-in-with-apple/google, link-identity(password|email), refresh-session, log-out,
│   │   │                           # confirm-email, resend-confirmation, request/complete-password-reset, reauthenticate, get/update-profile,
│   │   │                           # list/revoke-session, revoke-other-sessions, export-data, preview/request/cancel/finalize-deletion,
│   │   │                           # handle-apple-notification
│   │   ├── infrastructure/
│   │   │   ├── persistence/        # drizzle-*.repository.ts + mappers, security-event-log
│   │   │   ├── security/           # argon2 hasher, HIBP + common-list checker, jose access tokens, random tokens, AES-GCM encryptor
│   │   │   ├── providers/          # apple verifier + revoker, google verifier
│   │   │   ├── mail/               # IdentityMailer adapter + mail classes + templates (fr base, .en.html)
│   │   │   ├── budgets/            # no-op Budget*Port adapters until 002 provides real ones
│   │   │   └── jobs/               # finalize-deletions.job.ts (calls the use case)
│   │   ├── presentation/http/      # auth, me, sessions, deletion, apple-notifications controllers
│   │   └── identity.module.ts      # binds ports → adapters
│   └── budgets/                    # spec 002, same four layers
└── test/                           # e2e suites listed in quickstart.md

mobile/
├── app.json                        # CHANGED: scheme, plugins (apple auth, google signin, local-auth faceIDPermission, secure-store), associated domains
└── src/
    ├── app/
    │   ├── _layout.tsx             # CHANGED: auth gate, lock overlay, QueryClient, i18n
    │   ├── (auth)/                 # welcome, sign-up, login, forgot-password, link-account
    │   ├── (links)/                # confirm, reset, link, cancel-deletion
    │   ├── (app)/onboarding/       # owned by spec 002: choose.tsx (create or join), join-code.tsx; 001 routes users without a budget here
    │   ├── (app)/settings/         # profile, security (biometrics), sessions, export, delete-account
    │   └── pending-deletion.tsx
    ├── auth/                       # auth-store, api-client (refresh single-flight), secure-storage, providers
    ├── lock/                       # app-lock controller (AppState), biometric marker, privacy screen
    ├── i18n/                       # fr.json, en.json, setup
    └── components/                 # form fields, provider buttons, avatar (tokens only)
```

**Structure Decision**: Mobile + API monorepo using the existing `backend/` and `mobile/` folders, plus `packages/shared` as the single shared package required by Principles II and VII.

## Cross-Feature Dependencies

- **Spec 002 (shared budgets)** implements the four ports in [data-model.md](./data-model.md#ports-to-the-budgets-module-spec-002). Until then, no-op ports: onboarding always shows "create / enter code", and the "create budget" action is wired when 002 lands. Story 1's "reach an empty budget" acceptance test therefore completes only with 002 Story 1.
- **Ownership on account deletion** (recorded in spec 002's edge cases): deletion is never blocked; at permanent deletion, ownership of a shared budget transfers automatically to the oldest Admin, else the oldest person (research R12).
- **"Former member" wording** (recorded in spec 002's edge cases): a member who *leaves* keeps their name with a "former member" label; a *deleted account* shows "former member" with no name.
- **Apple relay users and invitations**: spec 002 FR-010 requires email invitations to match the account email, so relay-address users join with the 6-character code (002 FR-016).

## Risks & Items to Verify During Implementation

1. **Apple REST details** (token exchange, revoke, server notifications, relay sender registration) were not readable from Apple's docs during research — verify in the Apple Developer portal before coding (R8).
2. **Android biometric marker** may accept device PIN — verify on device; fallback design in R11.
3. **Production link domain** (`APP_LINK_BASE_URL`) not chosen; universal links need it before external testing.
4. **`@nestjs/drizzle`, `@nestjs/mail`, `@nestjs/outbox` are 0.x packages** first published in September 2026: pin exact versions (R2, R14).
5. **Dockerfile** currently builds only `backend/`; moving to a workspace build is required before the next deploy.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| Clean architecture layers (entities, use cases, ports, adapters) in the backend — research R19 | Project owner's requirement. About ten external integrations (Apple, Google, HIBP, SMTP, outbox, crypto) must be faked to test security rules quickly, without a database or network; keeps Drizzle and NestJS replaceable | Nest services calling Drizzle directly: rules coupled to the ORM, use-case tests need a database |

Kept small: no CQRS, no event sourcing, no generic repository base class, no mapper library (hand-written mappers). Deliberately *not* added: Redis (only needed with several backend instances), Passport, an email template engine, end-to-end UI automation (Maestro) — each can be added later with a plan justification.
