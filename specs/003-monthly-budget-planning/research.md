# Research: Monthly Budget Planning

**Feature**: 003-monthly-budget-planning | **Date**: 2026-11-16

Foundations from 001/002 are reused as-is: PostgreSQL 18 + Drizzle, `packages/shared`
(`/domain` + `/contracts`), clean-architecture backend modules, outbox, `BudgetAccess` /
`BudgetAccessGuard` (404 to non-members), the route-coverage authz test, TanStack Query,
i18next. This document only records what is new.

---

## R1. Where the month lives

- **Decision**: A `budget_month` row per budget and period, keyed by `(budget_id, period_start)`.
  Periods come from the existing `budgetMonthFor()` (002 R5, start-day rules and transition
  months included). URLs use `:monthStart` like the 002 income route. A month row is created
  by "create month" (US2), by import (US8), or implicitly as an empty Draft when the 002
  income route writes an income for a period without a row (R13).
- **Allowed periods**: any past period, the current one and the next one. Further future
  periods are refused (`400 invalid_month`) to keep the list understandable.
- **Label**: the calendar month holding most days of the period, ties to the later month
  (`monthLabelFor()` in shared domain; start day 1 → same month, 28 Oct–27 Nov → Novembre,
  2 Nov–1 Dec → Novembre). Rendered client-side with `Intl` in the user's locale (Principle VI).
- **Alternatives considered**: deriving months from lines only (no status, no revision, no
  place for the frozen snapshot); a month per calendar month (breaks the 002 start day).

## R2. Calculation engine (Principle II, FR-028–FR-032)

- **Decision**: New pure module `packages/shared/src/domain/planning/`, written test-first and
  used by both the backend (source of truth) and the app (live summary while typing):
  - `splitByWeights(total, weights[])`: largest-remainder in bigint; ties broken by member
    order (membership `joined_at`, then id). Equal = all weights 1; proportional = weights are
    household-counted incomes.
  - `computeShares(line, contributingMembers, incomes)`: per split mode; `one_payer` gives the
    whole total to the payer; `custom` returns the entered shares and fails `SPLIT_MISMATCH`
    (with the difference) when they do not add up to the total.
  - `monthlyFromFormula(formula)`: per year ÷ 12, half-year ÷ 6, quarter ÷ 3, × N, rounded
    half-up to the cent.
  - `computeMonthSummary(month)`: per member counted/other income, DI, DCR, DCE, what's left
    (signed), transfer, savings, savings rate; household totals. Takes **private aggregates**
    (R10) as opaque per-member amounts so the app can recompute without seeing private lines.
  - `savingsRatePermille(savings, income)`: integer tenths of a percent, half-up; null when
    income is 0. No floats anywhere.
- **Wire format**: amounts stay integer strings (002 `AmountMinor`). A new `SignedAmountMinor`
  (`/^-?\d{1,18}$/`) carries what's left, which can be negative.
- **Alternatives considered**: computing only on the server (no instant live summary, FR-031);
  SQL aggregates (a second implementation that can drift from the app's).

## R3. Property-based tests (SC-002)

- **Decision**: Add `fast-check` (dev dependency of `packages/shared` only). Generators build
  months with 1–6 members, 0–80 lines, every split mode, odd cents, periodic formulas,
  private lines and amounts typed as strings with `,` or `.` (fed through `parseAmount`).
  Each run checks ≥ 1 000 months against an **independent oracle** written in the test
  (a naive loop over lines, not reusing production helpers). Invariants also asserted:
  shares sum to total; household planned = Σ members (DI + DCR + DCE); every line counted
  exactly once; summary is independent of line order.
- **Regression fixtures**: `novembre-2026` (SC-003 figures) and the two spreadsheet bugs: an
  amount entered as text `"12,5"` and a member whose DCR summed fewer rows.
- **Alternatives considered**: hand-written table tests only (do not explore odd-cent and
  many-member corners); a different property library (fast-check is the de facto standard for
  Jest/TypeScript, zero runtime dependencies, dev-only).

## R4. Seeing the other member's edits within 5 s (FR-033, SC-004)

- **Decision**: **Conditional polling on a month revision.** Every write to a month bumps
  `budget_month.revision` in the same transaction. `GET /budgets/:b/months/:monthStart`
  returns `ETag: "<revision>"`; the app re-fetches every **2 s** with `If-None-Match` while the
  month screen is focused and the app is in the foreground (TanStack Query `refetchInterval`,
  paused in background). Unchanged → `304` with no body. Worst case ≈ 2 s + one round trip.
  Mutations return the full `MonthDetail`, so the author's screen updates immediately.
- **Cost**: a 304 is one indexed lookup (`revision` + membership check). With two people
  looking at a month, that is ≈ 1 req/s per active household, only while the screen is open.
- **Alternatives considered**:
  - WebSocket gateway: several API instances need a pub/sub fan-out (Redis or a Postgres
    LISTEN connection per instance) and reconnect logic; rejected for now (Principle X, 002
    already chose "no Redis").
  - Server-Sent Events: React Native has no `EventSource`; needs a polyfill and long-lived
    connections through the proxy.
  - Push notifications as a trigger: not guaranteed in time, and must not carry amounts.
  Polling can be swapped for SSE/WebSocket later behind the same query hook without contract
  changes (the ETag stays useful).

## R5. Concurrent edits (FR-034)

- **Decision**: Every mutation locks the month row (`SELECT … FOR UPDATE`) — it serializes
  revision bumps, proportional recomputes and propagation. Lines and income lines carry an
  integer `version`; `PATCH`/`DELETE` require `expectedVersion`. A mismatch returns
  **`409 stale_state`** with the current line (002 convention). The app shows the newer value
  and asks "Keep mine / Keep theirs"; "Keep mine" re-sends with the new version.
  Reorder sends the full ordered id list of one section; a different id set → `409 stale_state`.
- **Alternatives considered**: last-write-wins (forbidden by FR-034); field-level merging
  (more complex, little value for lines this small).

## R6. Storing lines and shares

- **Decision**: `budget_line` + `budget_line_share` (one row per contributing member, `0`
  allowed). `budget_line.total_minor` is stored because the user can type the total; a
  **deferrable constraint trigger** checks Σ shares = total at commit, as a last line of
  defence behind the domain check (Principle I). A Personal line has exactly one share row:
  its owner's. Shares are stored, not derived at read time, so history, closed snapshots and
  templates are stable when incomes change later.
- **Alternatives considered**: shares as jsonb on the line (no FK to memberships, harder to
  query DCR per member); deriving equal/proportional shares on read (closed months would
  change when an income is edited).

## R7. Recurring series, "from this month on" and "this month only" (FR-024, FR-025)

- **Decision**:
  - Each line has a `series_id` (UUID, no table). Copying a line into a new month keeps its
    `series_id`; one-off lines get a fresh one each time.
  - **This month only**: before applying the change, the line's current amount fields
    (total, split mode, payer, shares, formula) are saved in `usual` (jsonb) unless already
    there. Copies use `usual` when present, otherwise the current values. Setting the value
    back to the usual one clears `usual`.
  - **From this month on**: the change is applied and `usual` is cleared. Then, for every
    later month of the same budget holding a line with the same `series_id`, if that month is
    **Draft** and its line has `hand_edited = false`, the same change is applied there
    (clarification Q1 → B). Each propagated change bumps that month's revision and is recorded
    in its history with cause `propagation`.
  - `hand_edited` becomes true when someone edits the amount fields of that line in that month
    directly (not via propagation or recompute).
  - The scope is required (`422 scope_required`) when amount fields of a recurring line change;
    label, category, kind, envelope and privacy changes apply to this month only and are not
    propagated (keeps the rule to one thing users decide about: money).
- **Alternatives considered**: a separate "recurring line definition" table that months point
  to (two sources of truth for amounts; breaks the copy-on-create model).

## R8. Splits between members, joins and departures

- **Decision**: Contributing members of a month = memberships for which
  `isIncludedInMonth()` (002) is true. When membership changes during a non-Closed month:
  - **Join**: a `0` share row is added to every shared line; equal and proportional lines are
    recomputed; history records cause `recompute`.
  - **Departure**: 002 FR-033 keeps them in the current month, so nothing changes there.
  - **Copy into a new month**: shares of members not contributing in the target month are
    dropped; `custom` and `one_payer` lines that lose a share are flagged `needs_review`;
    Personal lines of a non-contributing member are not copied. A month with `needs_review`
    lines cannot be marked Active (`409 lines_need_review`).
  - The 002 membership use cases call a new `MonthMembershipSync` port inside their
    transaction.
- **Proportional with no income**: if the counted income total is 0, the line keeps its last
  shares and gets `needs_income = true`; choosing proportional on a new line is refused
  (`400 no_income_for_proportional`).

## R9. Proportional recompute on income change (FR-022)

- **Decision**: Creating, editing, deleting or toggling "counts" on an income line in a
  non-Closed month recomputes every proportional line of that month in the same transaction.
  Each changed line gets a history entry with cause `recompute` and the income editor as
  actor. `hand_edited` is not set by recomputes.

## R10. Privacy of personal lines (FR-018, FR-019, Principle III)

- **Decision**: Redaction happens **on the server**, in the application layer that builds
  `MonthDetail`, history and templates. For anyone other than the owner, a private line is
  never serialized; instead `privateAggregates[]` gives per member `{ totalMinor,
  savingsMinor }` (one "Privé" row), which the shared summary function consumes. History
  entries about private lines are returned as `{ kind, private: true, actor }` with no label
  or values. Authz e2e tests assert that a private label or amount never appears in any
  response to another member (string search on the JSON).
- Savings in private lines are aggregated so others' savings totals stay correct without
  revealing which line is savings.
- **Alternatives considered**: client-side hiding (the data would still reach the other phone).

## R11. Change history (FR-035, Principle I traceability)

- **Decision**: `month_change` rows written in the same transaction as each mutation, in every
  status. Stored structured (entity, action, field-level old/new, label snapshot, cause:
  `user | propagation | recompute | import | system`), rendered as sentences client-side
  through i18n ("{{actor}} a modifié {{label}} de {{old}} à {{new}}"). The history screen
  shows changes since activation by default, with a filter "Tout afficher" for Draft changes.
  Amounts are stored in the database (needed to show them) but never in logs or analytics.
- **Alternatives considered**: storing pre-rendered sentences (not translatable, Principle VI);
  generic row-level audit triggers (cannot express cause or privacy).

## R12. Month status machine and permissions

- **Decision**: `transitionMonth(from, to)` in shared domain: Draft→Active, Active→Closed,
  Closed→Active. New permissions added to the 002 matrix in `permissions.ts`:
  `months.create`, `months.activate`, `months.close` → owner, admin, member;
  `months.reopen` → owner, admin. Lines, categories, templates and import use the existing
  `entries.write`; incomes use `income.write.own`. Personal-line ownership is checked in the
  use case (`403 not_line_owner`).
- **Closing** stores `closed_summary` (jsonb, the full unredacted summary) on the month; reads
  of a Closed month use it, and every write returns `409 month_closed`. Reopen clears it.
- **Planned vs actual**: `MonthDetail.actuals` is `null` until feature 04 provides a port
  (`ActualsProvider`) returning per-line and per-member actual amounts; the contract field is
  defined now so 04 adds data without a breaking change.

## R13. Replacing 002's single monthly income

- **Decision**: New `income_line` table. Migration copies each `member_income` row into one
  income line (`label = null` → shown as "Revenu", `counts = true`, `is_primary = true`),
  creating the empty Draft `budget_month` rows it needs, then drops `member_income`.
  The 002 route `PUT /budgets/:b/members/me/income/:monthStart` stays (older app versions,
  Principle VII) and upserts the caller's primary income line. `MemberView.currentMonthIncome`
  becomes the member's counted income total. The 002 currency lock now checks for any
  `income_line` or `budget_line`.

## R14. Creating a month from a source (US2, US7)

- **Decision**: `POST /budgets/:b/months` with `source: previous | month | template | scratch`.
  Copy rules live in shared domain `copyLinesForNewMonth()` (pure, tested): recurring groups
  only (plus one-off when `includeOneOff`), usual values (R7), fresh ids and versions,
  `hand_edited = false`, same `series_id`, positions kept. Incomes are copied with
  `to_confirm = true`. If the target period already has a month **with no budget lines**
  (e.g. created by the 002 income route), the copy fills it and its incomes are kept;
  otherwise `409 month_exists`.

## R15. Templates

- **Decision**: `month_template` with its lines as a jsonb array validated by a Zod schema
  (`TemplateLine`), not normalized tables: templates are read and copied whole, never queried
  by line. Saving a template keeps the saver's own private lines (still private) and drops
  other members' private lines. Incomes are not stored (spec assumption).

## R16. Spreadsheet import (US8, clarification Q2 → .xlsx and .ods)

- **Decision**: Parse **on the device** with SheetJS Community Edition **0.20.3** installed from
  the official tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; the npm-registry
  `xlsx@0.18.5` has known vulnerabilities and is unmaintained). Pick the file with
  `expo-document-picker`. The raw file never leaves the phone.
- Mapping heuristics are pure functions in `packages/shared/src/domain/import/`: sheet name →
  period (French and English month names + year), member columns by first name, group
  detection from section headers (`DI`, `DCR`, `DCE`, "dépenses individuelles", "communes
  récurrentes", "exceptionnelles"), savings by keywords (PEA, PEL, assurance vie, livret,
  épargne), category by keyword table, amounts through `parseAmount` (so `"12,5"` text cells
  become 1 250 cents), and sheet totals detected from rows labelled "Total", "Reste".
- The preview is built on the device; `POST /budgets/:b/imports` with `dryRun: true` returns
  the server-recomputed summaries and conflicts (existing months), which the preview shows
  next to the sheet's own totals. Confirm sends the same body with `dryRun: false`; the server
  creates all months in one transaction (all or nothing). Past periods → Closed (with
  `closed_summary`), current/next → Draft. History cause `import`.
- **Alternatives considered**: uploading the file to the backend (the raw spreadsheet with
  every past amount would transit and need temporary storage; multipart endpoint);
  `exceljs` (no `.ods` support).

## R17. Offline (spec edge case)

- **Decision**: `expo-network` drives TanStack Query's `onlineManager`. Offline: cached month
  stays readable, edit controls are disabled with a banner "Hors ligne — modifications
  indisponibles". No offline queue (spec assumption).

## R18. Mobile screens

- **Decision**: Expo Router routes under `(app)/budgets/[budgetId]/months/`:
  - `index.tsx` month list (US7); `new.tsx` creation sheet (source choice, US2);
  - `[monthStart]/index.tsx` month screen: collapsible sticky summary (what's left + transfer
    per member, overrun icon + "Dépassement" text), sections DI per member, DCR, DCE,
    "Privé" rows, incomes;
  - `[monthStart]/line.tsx` (form sheet: add/edit, split, formula, sub-items) with a native
    action sheet "À partir de ce mois / Ce mois-ci uniquement" on save for recurring lines;
  - `[monthStart]/history.tsx`, `[monthStart]/income.tsx`;
  - `templates.tsx`, `categories.tsx`, `import/index.tsx` + `import/preview.tsx`.
- **Reorder**: an "Organiser" mode with move up/down buttons (accessible, 44 pt, works with
  screen readers) instead of drag-and-drop. No new dependency.
- **Amount input**: one shared `AmountField` using `parseAmount` and showing the error inline;
  amounts always rendered by the existing amount component (Principle V).
- **Quick-expense flow (Principle IV)**: untouched; the budget home keeps its entry point and
  the month screen is a separate stack.

## R19. Performance targets

- `GET month` with 80 lines × 6 members: 3 queries (month+lines+shares, incomes, sub-items),
  p95 < 300 ms; 304 path < 50 ms server time. Summary computation is O(lines × members).
- Index `budget_line (month_id, group, position)`, `budget_line (budget_id, series_id)` for
  propagation, `month_change (month_id, id)`.
