# API Contract: User Accounts (v1)

**Source of truth**: zod schemas in `packages/shared/src/contracts/auth.ts` and `me.ts`. This document describes them; if they differ, the code is wrong and must be fixed to match one or the other through review.

- Base path: `/v1`. JSON bodies, UTF-8. Authenticated routes take `Authorization: Bearer <accessToken>`.
- Every request is validated; invalid input → `400 { error: "VALIDATION_FAILED", issues: [...] }`.
- Errors: `{ error: <CODE>, retryAfterSeconds?: number }`. Codes are stable; the app translates them (Principle VI).
- Rate-limited routes return `429 { error: "RATE_LIMITED", retryAfterSeconds }`.

## Shared types

```ts
type Tokens = { accessToken: string; accessTokenExpiresAt: string /* ISO */; refreshToken: string };
type DeviceInfo = { deviceName: string /* ≤100 */; platform: "ios" | "android" | "web" };
type Me = {
  id: string; email: string; emailConfirmed: boolean; firstName: string;
  avatarKey: AvatarKey; colorKey: ColorKey; locale: "fr" | "en"; currency: string /* ISO 4217 */;
  signInMethods: Array<"password" | "apple" | "google">;
  status: "active" | "pending_deletion"; deletionScheduledAt: string | null;
  hasBudget: boolean;
};
type AuthResult = { tokens: Tokens; me: Me };
```

## Sign-up and sign-in

| Method & path | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `POST /v1/auth/signup` | — | `{ email, password, firstName, locale, device: DeviceInfo }` | `201 AuthResult` + confirmation email sent | `409 EMAIL_IN_USE` (FR-006a), `422 PASSWORD_TOO_SHORT`, `422 PASSWORD_BREACHED`, `409 ACCOUNT_PENDING_DELETION`, `429` |
| `POST /v1/auth/login` | — | `{ email, password, device }` | `200 AuthResult` | `401 INVALID_CREDENTIALS` (never says which field, FR-006), `423 ACCOUNT_LOCKED { retryAfterSeconds }`, `429` |
| `POST /v1/auth/apple` | — | `{ identityToken, authorizationCode, firstName?, locale, device }` | `200 AuthResult` (`201` if account created) | `401 INVALID_PROVIDER_TOKEN`, `409 LINK_REQUIRED { linkToken, emailHint }` |
| `POST /v1/auth/google` | — | `{ idToken, locale, device }` | same as Apple | same as Apple |
| `POST /v1/auth/link/password` | — | `{ linkToken, password, device }` | `200 AuthResult` (identity linked) | `401 INVALID_CREDENTIALS`, `410 LINK_EXPIRED`, `423` |
| `POST /v1/auth/link/email` | — | `{ linkToken }` | `202` (link email sent) | `410 LINK_EXPIRED` |
| `POST /v1/auth/refresh` | — | `{ refreshToken }` | `200 { tokens }` (rotated) | `401 SESSION_ENDED { reason }` |
| `POST /v1/auth/logout` | Bearer | — | `204` (current session revoked server-side, FR-024) | |
| `POST /v1/auth/reauthenticate` | Bearer | `{ password } \| { provider: "apple", identityToken } \| { provider: "google", idToken }` | `200 { reauthToken, expiresAt }` (5 min, single use; required by `DELETE /me`; also used for biometric fallback) | `401 INVALID_CREDENTIALS`, `423` |

`emailHint` is the masked existing email (e.g. `m•••@example.com`) — only returned after the provider has verified the caller owns that email.

## Email links (token from the link, see [deep-links.md](./deep-links.md))

| Method & path | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `POST /v1/auth/email/confirm` | — | `{ token }` | `200 { me? }` | `410 TOKEN_INVALID` (expired, used or superseded — one code) |
| `POST /v1/auth/email/resend-confirmation` | Bearer | — | `202` | `409 ALREADY_CONFIRMED`, `429` |
| `POST /v1/auth/password/forgot` | — | `{ email, locale }` | `202` always (FR-006) | `429` |
| `POST /v1/auth/password/reset` | — | `{ token, newPassword }` | `204`; all sessions ended; lockout lifted (FR-032) | `410 TOKEN_INVALID`, `422 PASSWORD_*` |
| `POST /v1/auth/link/confirm` | — | `{ token, device }` | `200 AuthResult` | `410 TOKEN_INVALID` |
| `POST /v1/me/deletion/cancel-by-link` | — | `{ token }` | `204` | `410 TOKEN_INVALID` |

## Profile, sessions, export, deletion

| Method & path | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `GET /v1/me` | Bearer | — | `200 Me` | |
| `PATCH /v1/me` | Bearer | `Partial<{ firstName, avatarKey, colorKey, locale, currency }>` | `200 Me` | `400` |
| `GET /v1/me/sessions` | Bearer | — | `200 { sessions: Array<{ id, deviceName, platform, signedInAt, lastActiveAt, current: boolean }> }` | |
| `DELETE /v1/me/sessions/:id` | Bearer | — | `204` | `404`, `400 CANNOT_REVOKE_CURRENT` |
| `POST /v1/me/sessions/revoke-others` | Bearer | — | `200 { revokedCount }` | |
| `GET /v1/me/export` | Bearer | — | `200 application/zip` (`export.json`, `profile.csv`, `sign-in-methods.csv`, `sessions.csv`, `budgets.csv`, `entries.csv`) | `429` (1 per minute) |
| `GET /v1/me/deletion/preview` | Bearer | — | `200 { budgetsDeleted: Array<{ id, name }>, budgetsLeft: Array<{ id, name, newOwnerFirstName? }>, scheduledAt }` | |
| `DELETE /v1/me` | Bearer | `{ reauthToken }` | `202 { deletionScheduledAt }`; all sessions ended; cancel email sent | `401 REAUTH_REQUIRED` |
| `POST /v1/me/deletion/cancel` | Bearer (session created by signing in during grace) | — | `200 Me` | `409 NOT_PENDING` |

**Pending-deletion sign-in**: `login`, `apple`, `google` succeed for a `pending_deletion` user but return `me.status = "pending_deletion"`; every route except `GET /me`, `POST /me/deletion/cancel` and `POST /auth/logout` returns `403 ACCOUNT_PENDING_DELETION` for that session.

## Apple server-to-server notifications

| Method & path | Auth | Body | Success |
|---|---|---|---|
| `POST /v1/auth/apple/notifications` | Apple-signed JWT (verified against Apple JWKS) | `{ payload: <JWT> }` | `200` |

Handled event types: `email-disabled`, `email-enabled`, `consent-revoked`, `account-delete` (format to verify in Apple portal, research R8).

## Error code → user message

All codes above map to translation keys `errors.<CODE>` in `mobile/src/i18n/{fr,en}.json`. No server-generated user text except emails.
