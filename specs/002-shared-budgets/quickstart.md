# Quickstart: Validate Shared Budgets & Membership

How to prove the feature works end to end. Shapes are in [contracts/rest-api.md](contracts/rest-api.md);
tables in [data-model.md](data-model.md).

## Prerequisites

- Node 24.9+ (`.node-version`), pnpm, Docker
- Repo root is a pnpm workspace (`backend`, `mobile`, `packages/*`)
- iOS simulator or Android emulator with a development build (deep links need one; Expo Go isn't enough for Universal Links)

## Setup

```bash
pnpm install --frozen-lockfile
docker compose up -d postgres postgres-test mailpit   # postgres:18 + mailpit (UI at http://localhost:8025)
pnpm --filter two-cents-backend db:migrate
pnpm --filter two-cents-backend start:dev                    # API on http://localhost:3000/v1
pnpm --filter two-cents-mobile start                         # then press i / a
```

## Automated checks (must all pass before merge)

| Command | Proves |
|---------|--------|
| `pnpm --filter @two-cents/shared test` | Budget month (incl. 1→28 and 28→1 transition months), `isIncludedInMonth` (leave on the 16th stays in that month), permission matrix, code normalization (`abc-12o` → `ABC120`), `parseAmount('12,5')` = 1250 |
| `pnpm --filter two-cents-backend test` | Service rules: ≤ 6 people, re-invite resends, single owner, transfer makes the old owner an admin |
| `pnpm --filter two-cents-backend test:e2e` | Every scenario below plus the **authorization matrix**: each `/budgets/:budgetId/*` route returns 404 to a non-member and 403 to a viewer on writes. The suite **fails if a route lacks a case** (SC-002) |
| `pnpm -r lint && pnpm -r typecheck` | Contracts compile in both apps |

## Manual scenarios

1. **Create** (US1): Sign in as Fabien → "Créer un budget" → name `Maison Maëlle & Fabien`, keep the defaults → the budget opens, with Fabien as Propriétaire and a month of 1–30 Nov. Repeat with start day 28 → 28 Oct – 27 Nov.
2. **Invite and join under 2 minutes** (US2, SC-001): Invite `maelle@example.com` → open Mailpit, check the email has the link and the code `XXX-XXX` and no amounts. On a second simulator with no account, open the link → sign up → the invitation screen shows the budget, "Fabien" and Accepter / Refuser → Accepter → enter income `2 450,50` → both devices show the two members and both incomes. Time it from opening the email.
3. **App not installed** (FR-016): Open `http://localhost:3000/i/<CODE>` (served outside `/v1`) in a desktop browser → store buttons and the code, no budget name. On a fresh install → sign up → "Vous avez un code d'invitation ?" → type the code in lowercase with `o` for `0` → the invitation screen opens.
4. **Wrong email** (FR-010): Sign in as `other@example.com` and open Maëlle's link → "Cette invitation a été envoyée à m•••@example.com", with a suggestion to ask for a code.
5. **Code invitation** (FR-011/012): Generate a code → accept it as user C → user D tries the same code → "déjà utilisée".
6. **Pending list** (US4): Invite the same email twice → one invitation, `send_count` 2, new expiry. Revoke it → the link shows "n'est plus valide". Fill the budget to 6 (members plus pending) → the next invite returns `budget_full`.
7. **Roles** (US5): Make C an Admin → C removes D → C tries to remove Fabien → refused. Fabien transfers ownership to Maëlle → Fabien is now Admin. Maëlle tries "Quitter" → asked to transfer or delete first.
8. **Former member** (FR-032/033): D leaves on the 16th → D's entries and income still show with "ancien membre" for the current month, and D is gone from next month's member list (check with a mocked clock in e2e).
9. **Picker** (US3): Create "Chatterie", switch to it, kill the app, reopen → "Chatterie". Sign in on a second device → also "Chatterie".
10. **Delete and restore** (US6): Type a wrong name → button disabled. Type the exact name → Maëlle gets a push and an email. Fabien sees it under "Récemment supprimés" → restore → members are back and the old invitation links are still dead. Advance the clock 30 days in e2e → purge → restore returns 404.
11. **Accessibility and layout** (SC-007, Principle VIII): With 6 members and the largest font size, in light and dark mode, with VoiceOver on: the picker, members, invitation and delete screens show no truncation, and every control has a label and a target of at least 44 pt.
