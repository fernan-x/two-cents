# Quickstart & Validation: User Accounts

Proves the feature works end to end. Contracts: [contracts/api.md](./contracts/api.md), [contracts/deep-links.md](./contracts/deep-links.md). Data: [data-model.md](./data-model.md).

## Prerequisites

- Node 24.9+, pnpm, Docker.
- A physical iPhone with Face ID/Touch ID and an Android phone with a fingerprint (biometrics and Apple sign-in do not work in simulators/Expo Go).
- Apple Developer account (Sign in with Apple capability, `.p8` key, registered email sender domain) and a Google Cloud OAuth client (iOS, Android, web client IDs).
- `backend/.env` from `backend/.env.example`: `DATABASE_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `IP_HASH_KEY`, `SMTP_URL`, `APP_LINK_BASE_URL`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`, `GOOGLE_WEB_CLIENT_ID`.

## Setup

```bash
pnpm install --frozen-lockfile                  # root workspace
docker compose up -d postgres postgres-test mailpit
pnpm --filter two-cents-backend db:migrate
pnpm --filter two-cents-backend start:dev       # API on :3000
cd mobile && npx eas-cli@latest build --profile development --platform ios   # once; then:
pnpm --filter two-cents-mobile start            # dev client
```

Mailpit UI: http://localhost:8025 (all emails land there in development). Postgres listens on **5442** (dev) and **5443** (tests) to avoid clashing with other local Postgres instances on 5432.

The mobile typecheck needs Expo Router's generated route types: run `npx expo start` once (or `npx expo customize`) so `.expo/types/router.d.ts` exists, including in CI.

## Automated checks (must all pass before merge)

```bash
pnpm --filter @two-cents/shared test            # domain rules: email normalisation, lockout, session idle, token validity, deletion date, lock timing
pnpm --filter two-cents-backend test            # unit
pnpm --filter two-cents-backend test:int        # repositories against postgres-test
pnpm --filter two-cents-backend test:e2e        # API against postgres-test, providers faked
pnpm --filter two-cents-mobile test             # auth store, lock logic, forms
pnpm -r lint && pnpm -r typecheck
```

e2e suites expected (one per user story): `signup.e2e`, `login-sessions.e2e`, `email-confirmation.e2e`, `password-reset.e2e`, `provider-linking.e2e`, `profile.e2e`, `sessions.e2e`, `export-deletion.e2e`, plus `privacy.e2e` (a different user's session cannot read `/me/*` data; logs and DB contain no plain tokens).

## Manual validation scenarios

| # | Scenario | Expected |
|---|---|---|
| 1 | Fresh install → sign up by email → create budget. Time it. | Empty budget in < 60 s (SC-001). Confirmation email in Mailpit. |
| 2 | Sign up with `Test@Example.com ` when `test@example.com` exists | "Email already in use" with login / reset actions |
| 3 | Sign in with Apple choosing "Hide my email" | Account created with relay email, shown as confirmed; email to relay address arrives (staging, real domain) |
| 4 | Sign in with Google using the email of an existing password account | "Prove it's you" screen; password path links; email path links after clicking link |
| 5 | Wrong password 5 times | Locked message with retry time; lock email; reset link lifts lock |
| 6 | Forgot password → open link twice; open a link after 1 h (set clock or DB) | First works and signs out other devices; second and expired show "no longer valid" |
| 7 | Sign in on phone + tablet; "log out of all other devices" on phone | Tablet returns to sign-in on its next action (SC-006) |
| 8 | Enable biometric + "require every open"; background 10 s, then 40 s | 10 s: no prompt. 40 s: prompt, no data visible behind it or in app switcher |
| 9 | Cancel Face ID prompt | Fallback offers password (or Apple/Google), **no device passcode** |
| 10 | Add a new fingerprint/face in device settings, reopen app | Biometric unlock disabled, fallback required, can re-enable |
| 11 | Edit first name to "Maëlle", language to English | Accents kept; UI switches to English immediately; persists on other device |
| 12 | Export data | Share sheet with ZIP containing JSON + CSVs; amounts as integer cents + formatted string |
| 13 | Delete account (sole member of budget A, co-member of budget B), then sign in within 7 days and cancel | Everything restored |
| 14 | Delete again, advance `deletion_scheduled_at` to the past, run the job | A gone; B kept with entries shown as "former member"; email reusable for a new account |
| 15 | Turn on airplane mode while signed in | Cached data visible after biometric unlock; sign-in/reset/delete say a connection is needed |

Every screen in scenarios 1–15 is also checked in dark mode, at the largest font size, and with VoiceOver or TalkBack (constitution quality gate).
