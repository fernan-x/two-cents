# Data Model: User Accounts

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Date**: 2026-11-16

PostgreSQL 18 via Drizzle (`backend/src/db/schema/*.ts`; one `pgTable` per table below, same snake_case names). All ids are UUID v7 (time-ordered). All timestamps are `timestamptz` in UTC. "Hash" means SHA-256 of a 256-bit random value, hex-encoded, unless stated otherwise. Budget tables (`budgets`, `budget_members`, `invitations`, entries) belong to spec 002; this feature only defines the ports it calls on them.

---

## users

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| email | text | As entered (trimmed), used for display and sending |
| email_normalized | text UNIQUE | `trim(lower(email))` via shared `normalizeEmail()`; unique across `active` and `pending_deletion` users (FR-003) |
| email_confirmed_at | timestamptz NULL | NULL = unconfirmed. Set at creation for Apple/Google accounts (FR-012) |
| email_deliverable | boolean default true | false after Apple `email-disabled` notification |
| first_name | text | 1–50 chars after trim, any script, NFC-normalised (FR-039) |
| avatar_key | text | One of the preset avatar keys in `@two-cents/shared` |
| color_key | text | One of the preset color tokens |
| locale | text | `fr` \| `en`, default from device locale, else `fr` |
| currency | char(3) | ISO 4217, default `EUR`; default currency for new budgets only |
| password_hash | text NULL | argon2id encoded string; NULL for provider-only accounts (FR-050) |
| failed_login_count | int default 0 | Reset on success / password reset |
| locked_until | timestamptz NULL | Set to now + 15 min at the 5th consecutive failure (FR-005) |
| status | enum `active` \| `pending_deletion` | |
| deletion_requested_at | timestamptz NULL | |
| deletion_scheduled_at | timestamptz NULL | `deletion_requested_at + 7 days` (shared `computeDeletionDate()`) |
| created_at, updated_at | timestamptz | |

**State transitions**

```text
(sign-up) ──► active ──(DELETE /me + re-auth)──► pending_deletion ──(scheduled_at reached, job)──► [row deleted]
                ▲                                     │
                └──────(sign in + cancel / cancel link)┘
```

- Permanent deletion removes the row; foreign keys from budget data use `ON DELETE SET NULL` → shown as "former member".
- While `pending_deletion`: no sessions can be created except the cancel flow; household views treat the user as "former member" (spec Clarifications Q2).

## auth_identities

One row per Apple/Google identity linked to a user (email + password lives on `users.password_hash`).

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users ON DELETE CASCADE | |
| provider | enum `apple` \| `google` | |
| provider_subject | text | Provider's stable `sub` (FR-008) |
| provider_email | text NULL | Last email reported (may be a relay address) |
| is_private_relay | boolean default false | Apple "hide my email" |
| apple_refresh_token_enc | bytea NULL | AES-256-GCM ciphertext (+ nonce), for revocation on deletion |
| created_at, last_used_at | timestamptz | |

- UNIQUE (`provider`, `provider_subject`).
- UNIQUE (`user_id`, `provider`) — one Apple and one Google identity per user.

## sessions

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | Carried as `sid` in the access token |
| user_id | uuid FK → users ON DELETE CASCADE | |
| auth_method | enum `password` \| `apple` \| `google` | Used to end sessions when a provider revokes consent |
| refresh_token_hash | text UNIQUE | Current refresh token |
| previous_refresh_token_hash | text NULL | Last rotated value — presenting it again = re-use → revoke session (R5) |
| device_name | text | e.g. "iPhone de Maëlle" (from `expo-device`), max 100 chars |
| device_platform | enum `ios` \| `android` \| `web` | |
| created_at | timestamptz | "Signed in on" |
| last_used_at | timestamptz | Updated on refresh; idle > 90 days = expired (FR-021) |
| reauth_token_hash | text NULL | Hash of the current re-authentication token (`POST /auth/reauthenticate`), single use |
| reauth_expires_at | timestamptz NULL | now + 5 min at issue; cleared when used |
| revoked_at | timestamptz NULL | |
| revoked_reason | enum `logout` \| `revoked_by_user` \| `password_changed` \| `reuse_detected` \| `provider_revoked` \| `account_deletion` NULL | |

- Active = `revoked_at IS NULL AND last_used_at > now() - 90 days` (shared `isSessionActive()`).
- Index (`user_id`) WHERE `revoked_at IS NULL`.

## email_tokens

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users ON DELETE CASCADE | |
| purpose | enum `confirm_email` \| `reset_password` \| `link_account` \| `cancel_deletion` | |
| token_hash | text UNIQUE | |
| pending_link_id | uuid NULL FK → pending_links | Only for `link_account` |
| expires_at | timestamptz | confirm 24 h, reset 1 h, link 1 h, cancel = `deletion_scheduled_at` |
| used_at | timestamptz NULL | Single use (FR-031) |
| superseded_at | timestamptz NULL | Set when a newer token of the same purpose is issued for the user |
| created_at | timestamptz | |

Valid = `used_at IS NULL AND superseded_at IS NULL AND expires_at > now()`.

## pending_links

Holds a verified provider identity waiting for proof of ownership of the matching account (R10).

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users ON DELETE CASCADE | The existing account with the same email |
| provider | enum `apple` \| `google` | |
| provider_subject | text | |
| provider_email | text | |
| is_private_relay | boolean | |
| apple_refresh_token_enc | bytea NULL | |
| link_token_hash | text UNIQUE | Returned to the app as `linkToken` |
| expires_at | timestamptz | now + 15 min (password path); email path uses the 1 h `email_tokens` row |
| completed_at | timestamptz NULL | |

## security_events

Append-only audit (FR-052). No emails, tokens, passwords or amounts.

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NULL | NULL after permanent deletion (ON DELETE SET NULL) or for unknown-email attempts |
| session_id | uuid NULL | |
| type | enum `signup` \| `login_succeeded` \| `login_failed` \| `account_locked` \| `password_reset_requested` \| `password_reset` \| `email_confirmed` \| `session_revoked` \| `identity_linked` \| `deletion_requested` \| `deletion_cancelled` \| `account_deleted` \| `breach_check_unavailable` \| `email_delivery_failed` | |
| ip_hash | text NULL | HMAC-SHA-256 of IP with a server key (rate-limit forensics without storing IPs) |
| user_agent_family | text NULL | e.g. "ios-app/1.0" |
| created_at | timestamptz | |

## Domain model (backend `identity/domain`, research R19)

Tables above are persistence; these are the entities and value objects the use cases work with. Repositories map between them; no Drizzle type leaves `infrastructure/`.

| Entity | Identity | Key behaviour (enforced invariants) |
|---|---|---|
| `User` | `UserId` | `register(...)`, `confirmEmail(now)`, `recordFailedLogin(now)` / `recordSuccessfulLogin()` (lockout via shared `nextLockState`), `isLockedOut(now)`, `changePassword(hash)` (lifts lockout), `updateProfile(...)`, `requestDeletion(now)` (→ `pending_deletion`, date via `computeDeletionDate`), `cancelDeletion()`, `assertActive()` |
| `Session` | `SessionId` | `open(userId, method, device, refreshHash, now)`, `rotate(presentedHash, newHash, now)` (detects re-use → revoke), `revoke(reason, now)`, `isActive(now)` (shared `isSessionActive`) |
| `AuthIdentity` | `(provider, subject)` | `link(userId)`, `updateEmail(email, isRelay)`, `revokeConsent()` |
| `EmailToken` | `EmailTokenId` | `issue(purpose, userId, hash, now)` (expiry per purpose), `consume(now)` (single use; fails if expired/used/superseded), `supersede(now)` |
| `PendingLink` | `PendingLinkId` | `create(...)`, `complete(now)`, `isExpired(now)` |

| Value object | Rule |
|---|---|
| `Email` | trimmed + normalised via shared `normalizeEmail`; keeps original for display |
| `FirstName` | NFC, 1–50 code points (shared `validateFirstName`) |
| `PlainPassword` | ≥ 10 code points (shared `validatePasswordPolicy`); never persisted or logged |
| `PasswordHash`, `TokenHash` | opaque strings produced by adapters |
| `Locale` | `fr` \| `en` |
| `CurrencyCode` | ISO 4217, 3 uppercase letters |

**Repository ports** (`identity/domain/ports`): `UserRepository`, `SessionRepository`, `AuthIdentityRepository`, `EmailTokenRepository`, `PendingLinkRepository`, `SecurityEventLog`.

**Application ports** (`identity/application/ports`): `PasswordHasher`, `BreachedPasswordChecker`, `SecretTokenGenerator`, `AccessTokenIssuer`, `AppleTokenVerifier`, `GoogleTokenVerifier`, `AppleTokenRevoker`, `SecretEncryptor`, `IdentityMailer`, `Clock`, `TransactionRunner`, `BudgetMembershipPort`, `BudgetExportPort`.

## Device-only state (not in the database)

| Key | Store | Content |
|---|---|---|
| `refresh_token` | expo-secure-store | Current refresh token |
| `biometric_marker` | expo-secure-store, `requireAuthentication: true` | Random value; read = biometric unlock (R11) |
| `lock_settings` | expo-secure-store | `{ biometricEnabled, requireOnEveryOpen }` |

## Ports to the budgets module (spec 002)

Interfaces defined by this feature, implemented by the budgets module; no-op implementations until 002 ships.

| Port | Called when | Must do |
|---|---|---|
| `hasAnyBudget(userId)` | After sign-in | Drive onboarding (FR-045) |
| `cancelInvitationsSentBy(userId)` | Deletion requested | FR-041a |
| `finalizeMemberDeletion(userId, tx)` | Deletion finalised | Delete sole-member budgets; transfer ownership (oldest Admin, else oldest member); remove memberships; entries' author → NULL (FR-042, R12) |
| `exportForUser(userId)` | Export | Budgets + entries with author first name or "former member" (FR-040) |

## Shared domain functions (`@two-cents/shared/domain`) — tests first

| Function | Rule |
|---|---|
| `normalizeEmail(raw)` | trim + lowercase (FR-003) |
| `validatePasswordPolicy(pw)` | ≥ 10 chars (counted as Unicode code points) |
| `validateFirstName(raw)` | NFC, trim, 1–50 code points |
| `isLockedOut(user, now)` / `nextLockState(count, now)` | 5 failures → 15 min |
| `isSessionActive(session, now)` | not revoked, idle ≤ 90 days |
| `isEmailTokenValid(token, now)` | not used, not superseded, not expired |
| `computeDeletionDate(requestedAt)` | + 7 days |
| `shouldLock({ coldStart, backgroundedAt, now, settings })` | cold start or > 30 s in background when lock enabled |
| `pickNewOwner(members)` | oldest Admin, else oldest member (shared with spec 002) |
