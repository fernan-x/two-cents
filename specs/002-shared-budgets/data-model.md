# Data Model: Shared Budgets & Membership

**Feature**: 002-shared-budgets | **Storage**: PostgreSQL (see research R1–R2)

Conventions: `id` = UUID v7; timestamps = `timestamptz`; money = `bigint` minor units + `char(3)`
currency (Principle I); names stored as entered (NFC-normalized, trimmed).
`user` is owned by 001-user-accounts and referenced here only.

---

## budget

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| name | text | 1–60 chars after trim (FR-001) |
| currency | char(3) | ISO 4217, default from creator's profile currency, else `EUR`; changeable only while no `member_income` row exists (FR-006) |
| time_zone | text | IANA zone, default creator device zone (R5) |
| created_at | timestamptz | |
| created_by | uuid → user | |
| deleted_at | timestamptz null | set on delete (FR-038); restore clears it (FR-038a) |
| deleted_by | uuid → user null | |

Indexes: `(deleted_at) WHERE deleted_at IS NOT NULL` for the purge job.

## budget_month_start_rule

The history of month start days (FR-004, FR-005, R5).

| Column | Type | Rules |
|--------|------|-------|
| budget_id | uuid → budget, cascade | |
| effective_from | date | first day of the first month governed by this rule (transition month start) |
| start_day | smallint | 1–28 (check constraint) |

PK `(budget_id, effective_from)`. Creation inserts one row with `effective_from = creation month start`.

## membership

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| budget_id | uuid → budget, cascade | |
| user_id | uuid → user, `ON DELETE SET NULL` | null after the account is permanently deleted (anonymous "Ancien membre", R14-C3) |
| display_name_snapshot | text | the user's first name at departure; shown with "former member" (FR-032); cleared when the account is deleted |
| role | enum `owner \| admin \| member \| viewer` | |
| joined_at | timestamptz | |
| left_at | timestamptz null | null = current membership |
| left_reason | enum `left \| removed \| account_deleted` null | |
| last_opened_at | timestamptz null | drives "reopen last budget" (FR-036) |

Constraints (R11):
- `UNIQUE (budget_id) WHERE role='owner' AND left_at IS NULL` (exactly one owner, FR-003; existence is checked by the service under lock)
- `UNIQUE (budget_id, user_id) WHERE left_at IS NULL`
- `CHECK (role <> 'owner' OR left_at IS NULL)`: an owner never leaves while owner (FR-030)

A rejoining former member gets a **new** membership row for the same `user_id`. History joins on `user_id`, so old and new activity link up. The "former member" label applies only to rows with `left_at` set.

### Inclusion in a budget month (FR-033, clarification Q3)

Domain function `isIncludedInMonth(membership, month)`:
`role <> 'viewer'` AND `joined_at` local date ≤ `month.end` AND (`left_at` is null OR `left_at` local date ≥ `month.start`).
So someone who leaves on 16 Nov stays in the month 1–30 Nov and is excluded from December. Unit-tested first.

### Role transitions

```text
          change_role (owner|admin)          transfer_ownership (owner only)
member ⇄ admin ⇄ viewer ⇄ member        owner → admin   +   target → owner   (one transaction)
any non-owner --leave|remove--> ended (left_at set)
owner --leave--> refused (409 owner_must_transfer)
```

## member_income

Monthly income per member and budget month (FR-024, FR-025a).

| Column | Type | Rules |
|--------|------|-------|
| membership_id | uuid → membership, cascade | |
| month_start | date | the budget month's start date |
| amount_minor | bigint | ≥ 0 |
| currency | char(3) | = budget currency |
| updated_at / updated_by | timestamptz / uuid → user | traceability (Principle I) |

PK `(membership_id, month_start)`. Visible to everyone in the budget (clarification Q2). Not allowed for viewers.

## invitation

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| budget_id | uuid → budget, cascade | |
| kind | enum `email \| code` | |
| email_normalized | text null | required when `kind='email'`; lower-cased and trimmed |
| role | enum `admin \| member \| viewer` | default `member` (FR-008) |
| code_hash | bytea | HMAC-SHA256 of the 6-char code (R6) |
| invited_by | uuid → user, `ON DELETE SET NULL` | |
| inviter_name_snapshot | text | shown on the invitation screen even if the inviter leaves |
| status | enum `pending \| accepted \| declined \| revoked \| expired` | |
| last_sent_at | timestamptz | |
| expires_at | timestamptz | `last_sent_at + 7 days` (FR-012) |
| send_count | int | |
| resolved_at / resolved_by | timestamptz / uuid → user null | accept, decline or revoke |

Constraints:
- `UNIQUE (budget_id, email_normalized) WHERE status='pending' AND kind='email'` (FR-014)
- `UNIQUE (code_hash) WHERE status='pending'`
- `CHECK (kind='code' OR email_normalized IS NOT NULL)`

"Effectively pending" = `status='pending' AND expires_at > now()`. Reads always apply this; the job only tidies up.

### State transitions

```text
pending --accept--> accepted         (single-row conditional UPDATE; concurrent second accept → 409 invitation_used)
pending --decline--> declined
pending --revoke--> revoked          (owner/admin; also on budget delete, FR-038c — never revived on restore)
pending --expires_at passes--> expired
pending --resend--> pending          (expires_at reset; code invitations get a new code_hash)
```

### Capacity rule (FR-023)

Under the budget row lock: `count(current memberships) + count(effectively pending invitations) < 6` before creating an invitation. Accepting doesn't change the total (pending → member).

## membership_event

Audit trail (FR-034, Principle I traceability). Append-only.

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| budget_id | uuid → budget, cascade | |
| type | enum `budget_created \| joined \| role_changed \| ownership_transferred \| removed \| left \| invitation_sent \| invitation_revoked \| settings_changed \| budget_deleted \| budget_restored` | |
| actor_user_id | uuid → user null | |
| target_membership_id | uuid → membership null | |
| details | jsonb | non-sensitive only: `{ fromRole, toRole }`, changed setting names. **No amounts, no emails** (Principle III) |
| created_at | timestamptz | |

Readable by the owner and admins.

## push_device

Push tokens (R8). Shared with 001.

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid → user, cascade | |
| session_id | uuid → session (001), cascade | the token dies with its session |
| expo_push_token | text unique | |
| platform | enum `ios \| android` | |
| updated_at | timestamptz | |

## invite_code_failure

Failed invitation-code lookups, for the per-account lockout (FR-022, R6): 5 failures in 15 minutes block lookups for 15 minutes.

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid → user, cascade | |
| failed_at | timestamptz | |

Index `(user_id, failed_at)`. Rows older than a day carry no meaning and are deleted by the expire-invitations job.

## Outbox messages (managed by `@nestjs/outbox`, schema `nest_outbox`)

Reliable email and push delivery (R9). No table of ours: the package owns its `messages`,
`dead_letters` and `inbox` tables. Our contract is the message payload, typed in
`@two-cents/shared/contracts`:

| Topic | Payload | Consumers |
|-------|---------|-----------|
| `invitation.sent` | `{ invitationId, recipientEmail, inviterFirstName, budgetName, link, code, locale }` | `invitation-email`, `invitation-push` |
| `budget.deleted` | `{ budgetId, budgetName, deletedByFirstName, recipientUserIds }` | `budget-deleted-email`, `budget-deleted-push` |
| `budget.restored` | `{ budgetId, budgetName, restoredByFirstName, recipientUserIds }` | `budget-restored-email`, `budget-restored-push` |
| `member.removed` | `{ budgetName, recipientUserId }` | `member-removed-push` |
| `budget.owner_changed` | `{ budgetId, budgetName, newOwnerFirstName, recipientUserIds }` | `owner-changed-email`, `owner-changed-push` (account deletion hand-off, R14-C2) |

Payloads never contain amounts (FR-042). Retention: inbox 30 days, handled dead letters
14 days, published messages 30 days (R9).

---

## Entity relationships

```text
user 1─* membership *─1 budget 1─* budget_month_start_rule
                    │           1─* invitation
                    │           1─* membership_event
membership 1─* member_income
user 1─* push_device
```

## Domain functions (`@two-cents/shared/domain`, test-first, Principle II)

| Function | Purpose |
|----------|---------|
| `budgetMonthFor(localDate, rules)` → `{ start, end }` | FR-004/FR-005, including transition months |
| `localDateIn(instant, timeZone)` | the edge conversion (R5) |
| `isIncludedInMonth(membership, month)` | FR-033 |
| `can(role, permission)` | permission matrix (FR-026) used by the guard and the UI |
| `normalizeInviteCode(input)` / `formatInviteCode(code)` | R6 |
| `canInvite({ currentMembers, pendingInvitations })` | FR-023 |
| `parseAmount(input)` → minor units | `12,5` and `12.5` (Principle I), for the income step |

### Permission matrix (`can`)

| Permission | owner | admin | member | viewer |
|------------|:-----:|:-----:|:------:|:------:|
| budget.read | ✓ | ✓ | ✓ | ✓ |
| budget.settings.edit | ✓ | ✓ | | |
| budget.delete / budget.restore | ✓ | | | |
| invitations.manage | ✓ | ✓ | | |
| members.manage (role of non-owner, remove non-owner) | ✓ | ✓ | | |
| ownership.transfer | ✓ | | | |
| entries.write (lines, transactions; later features) | ✓ | ✓ | ✓ | |
| income.write.own | ✓ | ✓ | ✓ | |
| membership.leave | | ✓ | ✓ | ✓ |
