# REST API Contract: Monthly Budget Planning

Source of truth at implementation time: Zod schemas in `packages/shared/src/contracts/`
(`months.ts`, `lines.ts`, `incomes.ts`, `categories.ts`, `templates.ts`, `imports.ts`),
Principle VII. Base path `/v1`. Auth, error envelope and common errors as in
[002 rest-api.md](../../002-shared-budgets/contracts/rest-api.md) (`401`, `404 budget_not_found`
for non-members, `403 forbidden`, `400 validation_failed`, `409 stale_state`, `429`).

**New errors**

| Status & code | When |
|---|---|
| `404 month_not_found` | no month for that period (members only; non-members still get `budget_not_found`) |
| `400 invalid_month` | not a period start, or beyond next month |
| `409 month_exists` | target period already has a month with lines |
| `409 month_closed` | any write to a Closed month |
| `409 invalid_transition` | status change not allowed |
| `409 lines_need_review` | activation while lines have `needsReview` (body: `lineIds`) |
| `400 split_mismatch` | shares ≠ total (body: `differenceMinor`, signed) |
| `400 no_income_for_proportional` | proportional chosen with 0 counted income |
| `400 sub_items_exceed_total` | |
| `422 scope_required` | amount fields of a recurring line changed without `scope` |
| `403 not_line_owner` / `403 not_income_owner` | personal line or income of another member |
| `409 stale_state` | `expectedVersion` mismatch; body: `{ current: LineView \| IncomeLineView }` |

Shared types (in addition to 002 `Money`, `PersonRef`, `BudgetMonth`):

```ts
type AmountMinor = string;          // /^\d{1,18}$/
type SignedAmountMinor = string;    // /^-?\d{1,18}$/
type MonthStatus = 'draft' | 'active' | 'closed';
type Group = 'personal' | 'recurring_shared' | 'one_off_shared';
type Kind = 'expense' | 'savings';
type SplitMode = 'custom' | 'equal' | 'proportional' | 'one_payer';
type Formula = { kind: 'per_year' | 'per_half_year' | 'per_quarter' | 'times'; baseMinor: AmountMinor; factor: number };
type Scope = 'from_this_month_on' | 'this_month_only';
```

---

## Months

| Method & path | Permission | Request | Response |
|---|---|---|---|
| `GET /budgets/:b/months?cursor` | budget.read | – | `200 { months: MonthListItem[], nextCursor }` newest first (FR-008) |
| `POST /budgets/:b/months` | months.create | `CreateMonthRequest` | `201 MonthDetail` · `409 month_exists` · `400 invalid_month` |
| `GET /budgets/:b/months/:monthStart` | budget.read | header `If-None-Match` | `200 MonthDetail` + `ETag: "<revision>"` · `304` unchanged (R4) |
| `POST /budgets/:b/months/:monthStart/status` | activate/close: months.activate / months.close; reopen: months.reopen | `{ action: 'activate' \| 'close' \| 'reopen' }` | `200 MonthDetail` |
| `GET /budgets/:b/months/:monthStart/history?cursor&all` | budget.read | `all=true` includes Draft-time changes | `200 { changes: ChangeView[], nextCursor }` |

```ts
type CreateMonthRequest = {
  periodStart: string;
  source:
    | { kind: 'previous' }
    | { kind: 'month'; monthStart: string; includeOneOff?: boolean }
    | { kind: 'template'; templateId: string }
    | { kind: 'scratch' };
};
type MonthListItem = {
  start: string; end: string; status: MonthStatus;
  members: { membershipId: string; whatsLeftMinor: SignedAmountMinor; overrun: boolean }[];
};
type MonthDetail = {
  month: { start: string; end: string; status: MonthStatus; revision: string;
           createdFrom: string; activatedAt: string | null; closedAt: string | null };
  currency: string;
  members: (PersonRef & { isMe: boolean; order: number })[];   // contributing members
  incomes: IncomeLineView[];
  lines: LineView[];                        // private lines of others are absent (R10)
  privateAggregates: { membershipId: string; totalMinor: AmountMinor; savingsMinor: AmountMinor; count: number }[];
  summary: MonthSummaryView;                // server computation (source of truth)
  actuals: null | ActualsView;              // filled by feature 04 (R12)
  flags: { incomesToConfirm: string[] /* membershipIds */; linesNeedReview: string[]; linesNeedIncome: string[] };
  can: { editShared: boolean; changeStatus: ('activate' | 'close' | 'reopen')[] };
};
type LineView = {
  id: string; seriesId: string; group: Group; kind: Kind; label: string;
  categoryId: string | null; isEnvelope: boolean;
  subItems: { id: string; label: string; amountMinor: AmountMinor | null }[];
  ownerMembershipId: string | null; isPrivate: boolean;      // isPrivate only ever true for the owner
  splitMode: SplitMode | null; payerMembershipId: string | null;
  totalMinor: AmountMinor; shares: { membershipId: string; amountMinor: AmountMinor }[];
  formula: Formula | null;
  position: number; version: number;
  isException: boolean; usualTotalMinor: AmountMinor | null;  // "this month only"
  needsReview: boolean; needsIncome: boolean;
  editable: boolean;
};
type IncomeLineView = {
  id: string; membershipId: string; label: string | null; amountMinor: AmountMinor;
  countsTowardHousehold: boolean; toConfirm: boolean; isPrimary: boolean;
  position: number; version: number; editable: boolean;
};
type MonthSummaryView = {
  members: {
    membershipId: string;
    countedIncomeMinor: AmountMinor; otherIncomeMinor: AmountMinor;
    diMinor: AmountMinor; dcrMinor: AmountMinor; dceMinor: AmountMinor;
    whatsLeftMinor: SignedAmountMinor; transferMinor: AmountMinor;
    savingsMinor: AmountMinor; savingsRatePermille: number | null; overrun: boolean;
  }[];
  household: { countedIncomeMinor; otherIncomeMinor; plannedMinor; whatsLeftMinor; transferMinor; savingsMinor };
};
type ChangeView = {
  id: string; at: string; actor: PersonRef | null;
  cause: 'user' | 'propagation' | 'recompute' | 'import' | 'system';
  entity: 'line' | 'income' | 'month' | 'order';
  action: 'created' | 'updated' | 'deleted' | 'reordered' | 'activated' | 'closed' | 'reopened' | 'confirmed';
  private: boolean;                                    // true → label and changes omitted for non-owners
  label: string | null;
  changes: { field: string; old: string | null; new: string | null }[];
};
```

## Lines

All line and income writes return `200/201 MonthDetail` (new revision + summary), so the author's
screen updates at once.

| Method & path | Permission | Request | Response |
|---|---|---|---|
| `POST /budgets/:b/months/:monthStart/lines` | entries.write (personal: own only) | `CreateLineRequest` | `201 MonthDetail` |
| `PATCH /budgets/:b/months/:monthStart/lines/:lineId` | entries.write (+ owner for personal) | `UpdateLineRequest` | `200 MonthDetail` · `409 stale_state` · `422 scope_required` |
| `DELETE /budgets/:b/months/:monthStart/lines/:lineId?expectedVersion=` | same | – | `200 MonthDetail` |
| `PUT /budgets/:b/months/:monthStart/lines/order` | same | `{ group, ownerMembershipId?, lineIds: string[] }` | `200 MonthDetail` · `409 stale_state` if the id set differs |

```ts
type LineAmountInput =
  | { entry: 'total'; totalMinor?: AmountMinor; formula?: Formula }      // exactly one of the two
  | { entry: 'shares'; shares: { membershipId: string; amountMinor: AmountMinor }[]; totalMinor?: AmountMinor };
type CreateLineRequest = {
  group: Group; kind?: Kind; label: string; categoryId?: string | null;
  isEnvelope?: boolean; subItems?: { label: string; amountMinor?: AmountMinor | null }[];
  ownerMembershipId?: string;             // personal: must be the caller
  isPrivate?: boolean;                    // personal only
  split?: { mode: SplitMode; payerMembershipId?: string };   // shared only, default custom
  amount: LineAmountInput;                // personal: entry 'total'
};
type UpdateLineRequest = Partial<Omit<CreateLineRequest, 'amount'>> & {
  expectedVersion: number;
  amount?: LineAmountInput;
  scope?: Scope;                          // required when amount/split changes on a recurring line
};
```

## Incomes

| Method & path | Permission | Request | Response |
|---|---|---|---|
| `POST /budgets/:b/months/:monthStart/incomes` | income.write.own | `{ label?, amountMinor, countsTowardHousehold? = true }` | `201 MonthDetail` |
| `PATCH /budgets/:b/months/:monthStart/incomes/:incomeId` | income.write.own (own line) | `{ expectedVersion, label?, amountMinor?, countsTowardHousehold? }` (clears `toConfirm`) | `200 MonthDetail` |
| `DELETE /budgets/:b/months/:monthStart/incomes/:incomeId?expectedVersion=` | same | – | `200 MonthDetail` |
| `POST /budgets/:b/months/:monthStart/incomes/confirm` | income.write.own | – (confirms all the caller's pre-filled lines) | `200 MonthDetail` |
| `PUT /budgets/:b/members/me/income/:monthStart` (002, kept) | income.write.own | `{ amountMinor }` | `200 Money` = caller's counted income; upserts the primary line (R13) |

## Categories

| Method & path | Permission | Request | Response |
|---|---|---|---|
| `GET /budgets/:b/categories` | budget.read | – | `200 { categories: { id, systemKey: string \| null, name: string \| null, position }[] }` |
| `POST /budgets/:b/categories` | entries.write | `{ name }` | `201 Category` |
| `PATCH /budgets/:b/categories/:id` | entries.write | `{ name?, position? }` | `200 Category` |
| `DELETE /budgets/:b/categories/:id` | entries.write | – | `204` (lines become uncategorized) |

## Templates

| Method & path | Permission | Request | Response |
|---|---|---|---|
| `GET /budgets/:b/templates` | budget.read | – | `200 { templates: { id, name, lineCount, updatedAt }[] }` |
| `POST /budgets/:b/templates` | entries.write | `{ name, fromMonthStart }` | `201 Template` · `409 template_name_taken` |
| `PATCH /budgets/:b/templates/:id` | entries.write | `{ name }` | `200 Template` |
| `DELETE /budgets/:b/templates/:id` | entries.write | – | `204` |

## Import

| Method & path | Permission | Request | Response |
|---|---|---|---|
| `POST /budgets/:b/imports` | entries.write | `ImportRequest` | `dryRun`: `200 ImportPreviewResult` · otherwise `201 { created: string[] /* monthStarts */ }` |

```ts
type ImportRequest = {
  dryRun: boolean;
  months: {
    periodStart: string;
    incomes: { membershipId: string; label?: string; amountMinor: AmountMinor; countsTowardHousehold: boolean }[];
    lines: Omit<CreateLineRequest, 'isPrivate'>[];   // amount entry 'shares' or 'total'
  }[];                                              // ≤ 36 months per request
};
type ImportPreviewResult = {
  months: {
    periodStart: string;
    conflict: 'exists' | null;                      // skipped by default in the app
    status: 'closed' | 'draft';                     // past → closed, current/next → draft
    summary: MonthSummaryView;                      // shown next to the sheet's own totals
    issues: { lineIndex: number; code: string }[];  // e.g. split_mismatch
  }[];
};
```

Commit is all-or-nothing; any month that conflicts or has issues → `400 import_invalid` with the
same `ImportPreviewResult`.

## Authorization coverage

Every route above is added to the 002 route-coverage e2e test (non-member → 404, Viewer → 403 on
writes). Extra privacy test: for a month with a private line, the JSON returned to every other
member by `GET month`, `GET history`, `GET templates` and every write response contains neither
the private label nor its amounts.
