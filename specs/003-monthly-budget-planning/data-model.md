# Data Model: Monthly Budget Planning

**Feature**: 003-monthly-budget-planning | **Storage**: PostgreSQL 18 (Drizzle), same conventions
as 002: `id` = UUID v7, timestamps `timestamptz`, money = `bigint` minor units + `char(3)`
currency (Principle I), text NFC-normalized and trimmed.

Referenced from 002: `budget`, `membership`, `budget_month_start_rule`. Dropped: `member_income`
(migrated into `income_line`, research R13).

---

## budget_month

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| budget_id | uuid → budget, cascade | |
| period_start | date | = `budgetMonthFor(...).start` (R1) |
| period_end | date | |
| status | enum `draft \| active \| closed` | see state machine |
| revision | bigint, default 0 | +1 on every write to the month (R4) |
| created_from | enum `previous \| month \| template \| scratch \| import \| income` | `income` = implicit row from the 002 income route |
| source_month_id | uuid → budget_month null, set null | |
| source_template_id | uuid → month_template null, set null | |
| created_at / created_by | timestamptz / uuid → membership | |
| activated_at / activated_by | null until first activation | |
| closed_at / closed_by | null unless Closed | |
| closed_summary | jsonb null | full unredacted `MonthSummary` frozen at close (FR-036); cleared on reopen |

Constraints: unique `(budget_id, period_start)`; check `period_end >= period_start`;
check `(status = 'closed') = (closed_summary IS NOT NULL)`.

**State machine** (shared `transitionMonth`, FR-002/FR-003):

```text
draft ──activate (owner|admin|member, no needs_review lines)──▶ active
active ──close (owner|admin|member)──▶ closed
closed ──reopen (owner|admin)──▶ active
```

Every other transition → `409 invalid_transition`. Writes to a closed month → `409 month_closed`.

## budget_category

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| budget_id | uuid → budget, cascade | |
| system_key | enum `housing \| food \| transport \| pets \| leisure \| health \| subscriptions \| savings \| gifts \| other` null | seeded rows; label translated client-side while `name` is null |
| name | text null | 1–40 chars; set on rename or for custom categories |
| position | int | |

Check `system_key IS NOT NULL OR name IS NOT NULL`. Unique `(budget_id, lower(name))` where name not null.
Seeded for every budget (new and existing, via migration). Deleting a category sets
`budget_line.category_id` to null (FK `ON DELETE SET NULL`).

## budget_line

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| month_id | uuid → budget_month, cascade | |
| budget_id | uuid → budget, cascade | denormalized for series lookups |
| series_id | uuid | same across months for a recurring line (R7) |
| group | enum `personal \| recurring_shared \| one_off_shared` | |
| kind | enum `expense \| savings` | default `expense` |
| label | text | 1–60 chars after trim (FR-013) |
| category_id | uuid → budget_category null, set null | |
| is_envelope | boolean | FR-015 |
| owner_membership_id | uuid → membership null | required iff `group = personal` |
| is_private | boolean | only when `group = personal` |
| split_mode | enum `custom \| equal \| proportional \| one_payer` null | null iff personal |
| payer_membership_id | uuid → membership null | required iff `split_mode = one_payer` |
| total_minor | bigint | 0 ≤ total ≤ 100 000 000 (1 000 000,00 €) |
| currency | char(3) | = budget currency |
| formula | jsonb null | `{ kind: 'per_year'\|'per_half_year'\|'per_quarter'\|'times', baseMinor: string, factor: int }`; when set, `total_minor = monthlyFromFormula(formula)` |
| position | int | order within (month, group, owner) |
| version | int, default 1 | +1 on each change (R5) |
| hand_edited | boolean | amount fields edited directly in this month (R7) |
| usual | jsonb null | "this month only" exception: the usual `{ totalMinor, splitMode, payerMembershipId, shares[], formula }` |
| needs_review | boolean | shares lost a member on copy (R8) |
| needs_income | boolean | proportional with no counted income (R8) |
| created_at/by, updated_at/by | | by = membership |

Checks: `(group = 'personal') = (owner_membership_id IS NOT NULL)`;
`(group = 'personal') = (split_mode IS NULL)`; `NOT is_private OR group = 'personal'`;
`(split_mode = 'one_payer') = (payer_membership_id IS NOT NULL)`; label length; total range.
Indexes: `(month_id, group, position)`, `(budget_id, series_id)`.

## budget_line_share

| Column | Type | Rules |
|--------|------|-------|
| line_id | uuid → budget_line, cascade | |
| membership_id | uuid → membership | a contributing member of the month |
| amount_minor | bigint | ≥ 0 |

PK `(line_id, membership_id)`. **Deferrable constraint trigger** (initially deferred): for each
touched line, Σ `amount_minor` = `budget_line.total_minor` (R6). Personal line → exactly one row,
for `owner_membership_id`.

## envelope_sub_item

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| line_id | uuid → budget_line, cascade | line must have `is_envelope = true` |
| label | text | 1–40 chars |
| amount_minor | bigint null | ≥ 0; Σ non-null amounts ≤ line total (domain check, FR-015) |
| position | int | |

## income_line

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| month_id | uuid → budget_month, cascade | |
| membership_id | uuid → membership | contributing member; only they can write (FR-010) |
| label | text null | 1–40 chars; null = default "Revenu" (migrated rows, 002 route) |
| amount_minor | bigint | 0 ≤ amount ≤ 100 000 000 |
| currency | char(3) | |
| counts_toward_household | boolean, default true | FR-009 |
| to_confirm | boolean | true when pre-filled by a copy (FR-006) |
| is_primary | boolean | the line the 002 `PUT …/income` route upserts; at most one per (month, member) |
| position | int | |
| version | int | R5 |
| created_at/by, updated_at/by | | |

Unique partial index `(month_id, membership_id) WHERE is_primary`.

## month_change (history)

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK (v7, ordered) | |
| month_id | uuid → budget_month, cascade | |
| actor_membership_id | uuid → membership null | null for system |
| cause | enum `user \| propagation \| recompute \| import \| system` | R11 |
| entity | enum `line \| income \| month \| order` | |
| entity_id | uuid null | |
| action | enum `created \| updated \| deleted \| reordered \| activated \| closed \| reopened \| confirmed` | |
| is_private | boolean | line was private at the time → redacted for non-owners (R10) |
| owner_membership_id | uuid null | owner of a private line, to decide who sees details |
| label_snapshot | text null | |
| changes | jsonb | `[{ field, old, new }]`; amounts as integer strings |
| month_status | enum | status when recorded (history filter, R11) |
| created_at | timestamptz | |

Index `(month_id, id)`.

## month_template

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| budget_id | uuid → budget, cascade | |
| name | text | 1–60 chars; unique per budget (case-insensitive) |
| lines | jsonb | `TemplateLine[]` (Zod, R15): group, kind, label, categoryId, isEnvelope, subItems, ownerMembershipId, isPrivate, split, totalMinor, shares, formula, position |
| created_by | uuid → membership | private lines kept only for this member |
| created_at / updated_at | | |

---

## Shared domain types (packages/shared/src/domain/planning)

```ts
type Minor = bigint;
interface PlanMember { membershipId: string; order: number }        // order = joined_at, then id
interface PlanIncome { membershipId: string; amount: Minor; counts: boolean }
interface PlanLine {
  group: 'personal' | 'recurring_shared' | 'one_off_shared';
  kind: 'expense' | 'savings';
  total: Minor;
  shares: ReadonlyMap<string, Minor>;   // membershipId → amount
}
interface PrivateAggregate { membershipId: string; total: Minor; savings: Minor }
interface MemberSummary {
  membershipId: string;
  countedIncome: Minor; otherIncome: Minor;
  di: Minor; dcr: Minor; dce: Minor;
  whatsLeft: Minor;            // signed
  transfer: Minor;             // dcr + dce
  savings: Minor;
  savingsRatePermille: number | null;
  overrun: boolean;            // whatsLeft < 0
}
interface MonthSummary { members: MemberSummary[]; household: { countedIncome; otherIncome; planned; whatsLeft; transfer; savings } }
```

Functions (test-first): `splitByWeights`, `computeShares`, `monthlyFromFormula`,
`computeMonthSummary`, `savingsRatePermille`, `transitionMonth`, `copyLinesForNewMonth`,
`shouldPropagate(laterMonthStatus, handEdited)`, `monthLabelFor`, `validateSubItems`;
`import/`: `periodFromSheetName`, `proposeSheetMapping`.

## Validation summary (from spec)

| Rule | Where |
|------|-------|
| Amount parsing `12,5` / `12.5` / spaces; reject letters, > 2 decimals, negatives | `parseAmount` (002), `AmountField`, import |
| Max 1 000 000,00 € per amount | domain + DB check |
| Shares add up to total | `computeShares` + deferred trigger |
| Personal line edited only by owner | use case (`403 not_line_owner`) |
| Private only on personal | domain + DB check |
| Proportional needs counted income > 0 | `computeShares` (`400 no_income_for_proportional`) |
| Sub-items Σ ≤ total | `validateSubItems` |
| Recurring amount change needs scope | use case (`422 scope_required`) |
| No writes when Closed | use case (`409 month_closed`) |
| Activate refused while lines need review | use case (`409 lines_need_review`) |
