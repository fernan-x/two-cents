# Links & Notifications Contract

## Deep links

| URL | App installed | App not installed |
|-----|---------------|-------------------|
| `https://<app-domain>/i/<CODE>` | Opens `mobile/src/app/i/[code].tsx`. Signed out: the code is kept through sign-up/sign-in, then the screen opens (FR-015) | Install page with the code (FR-016) |
| `twocents://budgets/<budgetId>` | Opens the budget (used by pushes) | n/a |

The app scheme moves from the starter's `mobile` to `twocents` in `app.json`.

## Post-sign-up prompt (FR-016a)

After 001 sign-up, if no pending code is held in memory, the app shows "Vous avez un code d'invitation ?" with a 6-character input (normalized as in data-model `normalizeInviteCode`) and "Passer", which leads to "Créer un budget / Rejoindre avec un code".

## Emails (French default, recipient language per 001)

| Template | Trigger | Content (no amounts, FR-042) |
|----------|---------|------------------------------|
| `invitation` | email invitation create or resend | inviter first name, budget name, role, button to `/i/<CODE>`, code `ABC-123` in large type, expiry date |
| `budget_deleted` | budget deleted | who deleted it, budget name, "the owner can restore it until <date>" |
| `budget_restored` | budget restored | who restored it, budget name |

## Push notifications

| Event | Recipients | Title / body (fr) | `data.url` |
|-------|-----------|-------------------|-----------|
| Email invitation to an existing account | that user | "Invitation de {inviter}" / "Rejoignez « {budget} » sur Two Cents" | `/i/<CODE>` |
| Budget deleted | all other current members | "Budget supprimé" / "{actor} a supprimé « {budget} »" | none |
| Budget restored | all current members | "Budget restauré" / "{actor} a restauré « {budget} »" | `/budgets/<id>` |
| Removed from a budget | the removed person | "Vous avez été retiré de « {budget} »" | none |

Pushes are best-effort through the outbox (research R9). An email is never skipped because a push succeeded.
