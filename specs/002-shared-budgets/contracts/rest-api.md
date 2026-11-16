# REST API Contract: Shared Budgets & Membership

Source of truth at implementation time: Zod schemas in `packages/shared/src/contracts/budgets/*.ts`
(Principle VII). This document lists the shapes they must define. Base path: `/v1`.
Auth: 001 session (bearer). Every response error is `{ "error": "<CODE>", ... }` as in 001: codes are written in upper case in the implementation (`budget_not_found` here is `BUDGET_NOT_FOUND` on the wire) and the app translates them (`errors.<CODE>`).

**Common errors**
- `401 unauthenticated`: no or expired session (001)
- `404 budget_not_found`: budget doesn't exist, is deleted, **or caller isn't a current member** (FR-040)
- `403 forbidden`: member without the permission (see the matrix in data-model.md)
- `403 email_not_confirmed`: creating or accepting invitations with an unconfirmed email (001 FR-011)
- `400 validation_failed`: Zod rejection, with `issues[]`
- `409 stale_state`: target changed since it was loaded; body includes the current resource
- `429 rate_limited`: includes `retryAfterSeconds`

Shared types:

```ts
type Role = 'owner' | 'admin' | 'member' | 'viewer';
type Money = { amountMinor: string /* integer as string, bigint-safe */; currency: string };
type BudgetMonth = { start: string /* YYYY-MM-DD */; end: string };
type PersonRef = { membershipId: string; displayName: string; formerMember: boolean };
```

---

## Budgets

| Method & path | Permission | Request | Response |
|---------------|-----------|---------|----------|
| `POST /budgets` | signed in | `{ name, currency?='EUR', monthStartDay?=1, timeZone }` | `201 BudgetDetail` |
| `GET /me/budgets` | signed in | – | `200 { budgets: BudgetSummary[], recentlyDeleted: DeletedBudget[] }` sorted by `lastOpenedAt` desc |
| `POST /budgets/:budgetId/open` | budget.read | – | `204` (sets `last_opened_at`, FR-036) |
| `GET /budgets/:budgetId` | budget.read | – | `200 BudgetDetail` |
| `PATCH /budgets/:budgetId` | budget.settings.edit | `{ name?, monthStartDay?, currency? }` | `200 BudgetDetail`. `409 currency_locked` if amounts exist (FR-006) |
| `DELETE /budgets/:budgetId` | budget.delete | `{ confirmName }` (must equal the name exactly, FR-037) | `204`. `400 confirm_name_mismatch` |
| `POST /budgets/:budgetId/restore` | owner of the deleted budget, within 30 days | – | `200 BudgetDetail`. `404` once purged or if the caller wasn't the owner |

```ts
type BudgetSummary = { id; name; currency; myRole: Role; memberCount: number; lastOpenedAt: string | null };
type BudgetDetail = BudgetSummary & {
  monthStartDay: number; timeZone: string;
  currentMonth: BudgetMonth;
  pendingMonthStartDay: { startDay: number; effectiveFrom: string } | null; // FR-005
  members: MemberView[];
  myIncomeMissing: boolean; // FR-025 reminder
};
type DeletedBudget = { id; name; deletedAt: string; purgeAt: string }; // only budgets the caller owned
```

The restore route is the **only** budget-scoped route that bypasses the "deleted = 404" rule. It has its own guard (`deleted_by_owner = caller`), and the coverage test checks it.

## Members

| Method & path | Permission | Request | Response |
|---------------|-----------|---------|----------|
| `GET /budgets/:budgetId/members` | budget.read | – | `200 { members: MemberView[], formerMembers: PersonRef[] }` |
| `PATCH /budgets/:budgetId/members/:membershipId` | members.manage | `{ role: 'admin' \| 'member' \| 'viewer' }` | `200 MemberView`. `403 cannot_modify_owner` |
| `DELETE /budgets/:budgetId/members/:membershipId` | members.manage | – | `204`. `403 cannot_modify_owner` |
| `POST /budgets/:budgetId/ownership` | ownership.transfer | `{ toMembershipId }` | `200 BudgetDetail` (previous owner → admin, FR-028) |
| `POST /budgets/:budgetId/leave` | membership.leave | – | `204`. `409 owner_must_transfer` (FR-030) |
| `GET /budgets/:budgetId/events` | members.manage | `?cursor` | `200 { events: MembershipEvent[], nextCursor }` |

```ts
type MemberView = {
  membershipId; userId; displayName; avatar; color; role: Role; joinedAt: string;
  isMe: boolean;
  currentMonthIncome: Money | null; // visible to all (clarification Q2); null for viewers or not entered
};
```

## Income

| Method & path | Permission | Request | Response |
|---------------|-----------|---------|----------|
| `PUT /budgets/:budgetId/members/me/income/:monthStart` | income.write.own | `{ amountMinor: string }` | `200 Money`. `400 invalid_amount` |

`monthStart` must be the start of a valid budget month for that budget, and the current or a past month the member was included in. Otherwise `400 invalid_month`.

## Invitations (owner/admin side)

| Method & path | Permission | Request | Response |
|---------------|-----------|---------|----------|
| `POST /budgets/:budgetId/invitations` | invitations.manage | `{ kind: 'email', email, role?='member' }` or `{ kind: 'code', role?='member' }` | `201 CreatedInvitation` (new) or `200 CreatedInvitation` (an existing pending email invitation was resent, FR-014). `409 already_member`, `409 budget_full` (FR-023) |
| `GET /budgets/:budgetId/invitations` | invitations.manage | `?status=pending\|all` | `200 { invitations: InvitationView[] }` |
| `POST /budgets/:budgetId/invitations/:invitationId/resend` | invitations.manage | – | `200 CreatedInvitation` (a new code for `kind:'code'`) |
| `DELETE /budgets/:budgetId/invitations/:invitationId` | invitations.manage | – | `204` (revoke) |

```ts
type CreatedInvitation = InvitationView & { code: string /* "ABC-123", shown once */; link: string };
type InvitationView = {
  id; kind: 'email' | 'code'; email: string | null; role: Role;
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
  invitedBy: string; lastSentAt: string; expiresAt: string;
};
```

## Invitations (invitee side)

These aren't budget-scoped: the invitee isn't a member yet. They're rate-limited (FR-022): 5 failed lookups per account per 15 minutes.

| Method & path | Auth | Request | Response |
|---------------|------|---------|----------|
| `GET /invitations/:code` | signed in, email confirmed | – | `200 InvitationPreview` or `410 { error: 'invitation_expired' \| 'invitation_revoked' \| 'invitation_declined' \| 'invitation_used', inviterName }` (FR-021) or `404 invitation_not_found` (counts as a failed attempt) or `403 invitation_wrong_email { invitedEmailMasked: "p•••@example.com" }` (FR-010) or `409 already_member { budgetId }` (code not consumed) |
| `POST /invitations/:code/accept` | same | – | `200 { budgetId, role, askIncome: boolean, currentMonth: BudgetMonth }` (`askIncome` false for viewers). The same errors as above, plus `409 budget_full` |
| `POST /invitations/:code/decline` | same | – | `204` |

```ts
type InvitationPreview = { budgetName; inviterName; role: Role; expiresAt: string; memberCount: number };
```

## Push devices (shared with 001)

| Method & path | Auth | Request | Response |
|---------------|------|---------|----------|
| `PUT /me/push-devices` | signed in | `{ expoPushToken, platform }` | `204` (upsert for the current session) |
| `DELETE /me/push-devices/current` | signed in | – | `204` |

## Public (unauthenticated)

Served **outside** the `/v1` prefix (like 001's `/l/*` pages), because they are the Universal Link / App Link URLs.

| Method & path | Response |
|---------------|----------|
| `GET /i/:code` | `200 text/html` install page: store buttons and the formatted code. **No budget or inviter data.** Rate-limited per IP |
| `GET /.well-known/apple-app-site-association` | iOS Universal Links for `/i/*` |
| `GET /.well-known/assetlinks.json` | Android App Links for `/i/*` |
