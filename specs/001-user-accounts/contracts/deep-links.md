# Deep-Link & Email Contract: User Accounts

## Links sent by email

Base URL: `APP_LINK_BASE_URL` (production: an HTTPS domain configured for iOS Universal Links and Android App Links; development: `twocents://`).

| Purpose | URL | App route (Expo Router) | Calls | Validity |
|---|---|---|---|---|
| Confirm email | `/l/confirm?t=<token>` | `src/app/(links)/confirm.tsx` | `POST /v1/auth/email/confirm` | 24 h, single use |
| Reset password | `/l/reset?t=<token>` | `src/app/(links)/reset.tsx` | `POST /v1/auth/password/reset` | 1 h, single use, superseded by newer |
| Link account | `/l/link?t=<token>` | `src/app/(links)/link.tsx` | `POST /v1/auth/link/confirm` | 1 h, single use |
| Cancel deletion | `/l/cancel-deletion?t=<token>` | `src/app/(links)/cancel-deletion.tsx` | `POST /v1/me/deletion/cancel-by-link` | until scheduled deletion |

- The token is read from the URL and sent in the request **body**, never logged.
- If the app is not installed, the HTTPS domain serves a static page (FR/EN) asking the user to install/open Two Cents. It does not consume the token.
- Invalid/expired/used token → one screen: "This link is no longer valid" + the matching "send a new one" action (FR-010, FR-031).

## Emails

Sent in the user's `locale` (FR-053), plain text + minimal HTML, from a domain registered with Apple Private Email Relay (research R8).

| Email | Trigger | Content |
|---|---|---|
| Confirm your email | Sign-up, resend | Link, validity (24 h) |
| Reset your password | Forgot password (only if an account exists) | Link, validity (1 h), "ignore if not you" |
| Your password was changed | Reset / change | Time, "all other devices were signed out", what to do if not you |
| Link Apple/Google to your account | `POST /auth/link/email` | Provider name, link (1 h) |
| Account deletion scheduled | `DELETE /me` | Permanent date, cancel link |
| Account deleted | Finalisation | Confirmation only (sent before the email address is erased) |
| Account temporarily locked | 5th failed login | Unlock time, reset-password link suggestion |

Emails never contain amounts, budget names or entry labels (Principle III).
