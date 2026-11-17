# Feature Specification: Monthly Budget Planning

**Feature Branch**: `003-monthly-budget-planning`

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "This is the heart of the app. It reproduces, and fixes, how the household currently plans each month in a spreadsheet. Each month the members decide how much each of them puts toward each expense, and the app computes what each member has left and how much each must transfer to the joint account. Month (Draft → Active → Closed); income lines per member with a 'counts toward the household budget' flag; budget lines with label, group (Personal DI / Recurring shared DCR / One-off shared DCE), kind (expense / savings), optional category, envelope flag and sub-items; per-line split (custom, equal, proportional to income, one member pays all) that must add up; annual or periodic amounts stored monthly with the original formula; computed per-member totals, what's left, transfer to joint account, savings rate, household totals, including every line. Stories: create a month from the previous one / from scratch / from a template; add, edit, reorder, delete lines with personal-line privacy; change a recurring line 'from this month on' or 'this month only'; live summary with negative warning; mark Active with change history; close and reopen; browse and duplicate past months; import the existing spreadsheet with a preview. Example Novembre 2026 (Maëlle −6,84 ⚠ left, Fabien 158,16 left). Out of scope: bank connections, multiple currencies in one budget. Success: new month from previous in under 3 minutes; totals always match a manual recomputation (property-based tests); both members see each other's edits within 5 seconds."

## Clarifications

### Session 2026-11-16

- Q: Should a "from this month on" change also update later months that already exist? → A: Yes for later Draft months whose value for that line was not edited by hand; Active and Closed months are never changed.
- Q: Which spreadsheet sources must the import support? → A: Excel (.xlsx) and OpenDocument (.ods) files only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plan a month and see what each member has left (Priority: P1)

A member opens a month in Draft, enters each member's income lines (salary, meal vouchers, bonus…), and adds budget lines in the three groups: Personal (DI), Recurring shared (DCR) and One-off shared (DCE). For each line they enter a label, a kind (expense or savings) and how much each member puts in. While they type, a summary shows, for each member, the totals per group, what's left, and the transfer to the joint account, plus household totals. If a member's "what's left" goes below zero, the summary flags it clearly.

**Why this priority**: This is the spreadsheet the household uses today. Without it, nothing else in the app has a purpose. On its own it already replaces the spreadsheet and fixes its two bugs.

**Independent Test**: Enter the Novembre 2026 example (incomes 2 000,00 € and 2 990,00 €, and lines summing to the figures below) in an empty month and check that the summary shows exactly: Maëlle DI 144,32 / DCR 1 587,52 / DCE 275,00 / what's left −6,84 € with a warning / transfer 1 862,52 €; Fabien DI 589,32 / DCR 1 967,52 / DCE 275,00 / what's left 158,16 € / transfer 2 242,52 €.

**Acceptance Scenarios**:

1. **Given** a Draft month with no lines, **When** a member adds a Recurring shared line "Courses" with Maëlle 100 € and Fabien 300 €, **Then** the line shows a total of 400 €, and each member's DCR, what's left and transfer update immediately.
2. **Given** a member typing an amount, **When** they enter `12,5`, `12.5` or `1 234,56`, **Then** the amount is accepted as 12,50 €, 12,50 € or 1 234,56 € and counted in every total.
3. **Given** a member typing an amount, **When** they enter `12,5a`, `12,555` or leave text that is not a number, **Then** the line cannot be saved and the field explains what is wrong; nothing is stored.
4. **Given** the Novembre 2026 example, **When** Maëlle's lines exceed her household-counted income, **Then** her "what's left" shows −6,84 € with a warning icon and text (not color alone).
5. **Given** Fabien has a salary of 2 990 € (counts toward the household) and Swile meal vouchers of 160 € (does not count), **When** the summary is shown, **Then** his household-counted income is 2 990 € and the vouchers appear separately as "not counted".
6. **Given** a month with savings lines (PEA, life insurance) in several groups, **When** the summary is shown, **Then** each member's savings total and savings rate (savings ÷ household-counted income) are displayed, and household savings are shown too.
7. **Given** two members both viewing the same month, **When** one saves a change, **Then** the other sees the updated line and summary within 5 seconds without refreshing.

---

### User Story 2 - Start a new month from the previous one (Priority: P1)

When a new month begins, a member creates it from the previous month. Recurring lines (Personal and Recurring shared) are copied with their amounts, splits and settings; One-off shared lines are not. Each member's income lines are pre-filled from last month and marked "to confirm". The member reviews, adjusts a few amounts, adds this month's one-off expenses, and is done in a few minutes. They can also start from scratch or from a saved template.

**Why this priority**: Most months look like the previous one. Fast month creation is the main reason to leave the spreadsheet (success target: under 3 minutes).

**Independent Test**: With a complete Novembre 2026 month, create Décembre 2026 from it; check that every DI and DCR line is present with identical amounts and splits, no DCE line is present, incomes are pre-filled and flagged "to confirm", and the totals are recomputed.

**Acceptance Scenarios**:

1. **Given** Novembre 2026 exists with 25 recurring lines and 2 one-off lines, **When** a member creates Décembre 2026 "from previous month", **Then** Décembre contains the 25 recurring lines (same label, group, kind, category, split, amounts, periodic formula, envelope flag, sub-items, privacy) and none of the 2 one-off lines, in Draft status.
2. **Given** the new month was created from the previous one, **When** a member opens it, **Then** each member's income lines show last month's values with a "to confirm" badge until that member confirms or edits them.
3. **Given** a saved template "Mois type", **When** a member creates a month from it, **Then** the month contains the template's lines and no incomes are pre-filled beyond what the template defines (none).
4. **Given** any month, **When** a member chooses "save as template" and names it, **Then** the template appears in the list of starting points for new months.
5. **Given** a member chooses "start from scratch", **When** the month is created, **Then** it has no lines and no incomes.
6. **Given** Décembre 2026 already exists, **When** a member tries to create Décembre 2026 again, **Then** creation is refused and they are offered to open the existing month.

---

### User Story 3 - Split shared lines and enter periodic amounts (Priority: P2)

For each shared line, a member picks how it is split: custom amounts (default), equal split, proportional to this month's household-counted income, or one member pays everything. They can type the total and let the app compute each member's share, or type each share and let the app compute the total. For yearly or repeated costs they type "80 € per year" or "47 € × 2"; the app stores the monthly amount and keeps the formula as a hint ("80 €/an ÷ 12").

**Why this priority**: Custom amounts (P1) already let the household plan. Automatic splits and periodic amounts remove mental arithmetic and errors, but are not required for a first usable version.

**Independent Test**: On a month with incomes 2 000 € / 3 000 €, create a 500 € line split proportionally and check 200 € / 300 €; switch it to equal and check 250 € / 250 €; enter "80 € per year" on another line and check the monthly amount is 6,67 € with the hint "80 €/an ÷ 12".

**Acceptance Scenarios**:

1. **Given** incomes of 2 000 € and 3 000 € (household-counted), **When** a 500 € line is set to "proportional to income", **Then** the shares are 200 € and 300 €.
2. **Given** an equal split of 10,01 € between two members, **When** the shares are computed, **Then** they are 5,01 € and 5,00 € according to the documented remainder rule, and they add up to exactly 10,01 €.
3. **Given** a custom split, **When** the member enters a total of 400 € and shares of 100 € and 250 €, **Then** the line cannot be saved and the difference (50 €) is shown.
4. **Given** "one member pays everything" with Fabien chosen, **When** the total is 60 €, **Then** Fabien's share is 60 € and Maëlle's is 0 €.
5. **Given** a line entered as "80 € per year", **When** it is saved, **Then** the monthly amount is 6,67 € and the hint "80 €/an ÷ 12" is shown next to it.
6. **Given** a line entered as "47 € × 2", **When** it is saved, **Then** the monthly amount is 94,00 € and the hint "47 € × 2" is shown.
7. **Given** a proportional line, **When** a member's household-counted income changes, **Then** the shares are recomputed immediately and the summary updates.

---

### User Story 4 - Personal lines and privacy (Priority: P2)

Each member manages their own personal lines (phone plan, subscriptions, therapist, personal savings…). The other members see these lines read-only, so the household knows where the money goes. A member can mark one of their personal lines private: the others then only see a single "Private" amount counted in that member's totals, without label or details.

**Why this priority**: Needed so both partners can use the app without giving up their privacy, but the month can be planned without it.

**Independent Test**: As Maëlle, add a private personal line "Psy" 60 €; as Fabien, check that Maëlle's personal section shows "Private — 60,00 €" without the label, that her DI total includes the 60 €, and that Fabien cannot edit any of Maëlle's personal lines.

**Acceptance Scenarios**:

1. **Given** Maëlle's personal line "Forfait mobile" 15 €, **When** Fabien views the month, **Then** he sees the line and amount but cannot edit, move or delete it.
2. **Given** Maëlle marks "Psy" 60 € and "Cadeau surprise" 40 € private, **When** Fabien views the month, **Then** he sees one row "Private — 100,00 €" in Maëlle's personal section and her DI total includes it.
3. **Given** a private line, **When** its owner changes its amount in an Active month, **Then** the change history visible to others reads "Maëlle changed a private line" without label or amounts.
4. **Given** a shared line, **When** a member tries to mark it private, **Then** the option is not available (only personal lines can be private).

---

### User Story 5 - Agree on the plan, track changes, close and reopen (Priority: P2)

Once the members agree, one of them marks the month Active. Changes are still allowed, but each one appears in the month's change history ("Fabien changed Courses from 280 € to 300 €"). At the end, a member closes the month: totals are frozen and the app shows planned vs actual if transactions were recorded. The owner can reopen a closed month if something needs fixing.

**Why this priority**: Makes the agreement explicit and keeps trust when amounts move after the plan was agreed. Planning itself works without it.

**Independent Test**: Activate a month, change a shared line from 280 € to 300 €, check the history entry with author, old and new values and time; close the month, check no edit is possible and the frozen totals are shown; reopen as owner and check edits work again.

**Acceptance Scenarios**:

1. **Given** a Draft month, **When** a member marks it Active, **Then** its status becomes Active for everyone and the activation is recorded with who and when.
2. **Given** an Active month, **When** Fabien changes "Courses" from 280 € to 300 €, **Then** the history shows "Fabien changed Courses from 280,00 € to 300,00 €" with the date and time, and the other member sees it.
3. **Given** an Active month, **When** a member closes it, **Then** the status is Closed, totals are frozen, and every edit attempt on lines or incomes is refused with an explanation.
4. **Given** a Closed month with transactions recorded (feature 04), **When** a member opens it, **Then** each line and each total shows planned vs actual; **Given** no transactions, **Then** only planned figures are shown.
5. **Given** a Closed month, **When** the owner (or an Admin) reopens it, **Then** it returns to Active, the reopening is recorded in the history, and edits are allowed again; **When** a Member or Viewer tries, **Then** the action is not available.

---

### User Story 6 - Change a recurring line from this month on, or this month only (Priority: P2)

When a member edits a recurring line (Personal or Recurring shared), they choose whether the change applies "from this month on" (it becomes the new usual value, copied into later months) or "this month only" (an exception: later months created from this one keep the previous usual value).

**Why this priority**: Without it, a one-time exception (e.g. a bigger grocery budget in December) is silently carried into every later month, or a real change (rent increase) must be retyped each month.

**Independent Test**: In Novembre, change "Loyer" from 900 € to 950 € "from this month on" and "Courses" from 400 € to 600 € "this month only"; create Décembre from Novembre and check Loyer = 950 € and Courses = 400 €.

**Acceptance Scenarios**:

1. **Given** a recurring line "Loyer" 900 €, **When** a member changes it to 950 € "from this month on", **Then** months later created from this month copy 950 €.
2. **Given** a recurring line "Courses" 400 €, **When** a member changes it to 600 € "this month only", **Then** this month shows 600 € marked as an exception, and months later created from this month copy 400 €.
3. **Given** a one-off line, **When** a member edits it, **Then** no "from this month on / this month only" choice is offered.
4. **Given** Décembre already exists in Draft and its "Loyer" was not edited by hand, **When** a member changes "Loyer" in Novembre to 950 € "from this month on", **Then** Décembre's "Loyer" becomes 950 € and the change is recorded in Décembre's history; **Given** Décembre's "Loyer" was edited by hand, or Décembre is Active or Closed, **Then** Décembre is left unchanged.

---

### User Story 7 - Browse past months and duplicate one (Priority: P3)

A member scrolls through the list of past months (name, status, what's left per member) and opens any of them. They can use any past month as the starting point for a new month, for example to reuse last December's plan for this December.

**Why this priority**: Useful for seasonal months and for looking back, but "from previous month" covers the common case.

**Independent Test**: With 12 past months, open Décembre 2025, choose "use as basis for a new month", and check the new month contains Décembre 2025's recurring lines, and optionally its one-off lines if the member asked for them.

**Acceptance Scenarios**:

1. **Given** several months, **When** a member opens the month list, **Then** months are listed newest first with their status and each member's "what's left", negative values flagged.
2. **Given** a past month, **When** a member duplicates it as the basis for a new month, **Then** the same copy rules as "from previous month" apply, with an extra option to also copy one-off lines.

---

### User Story 8 - Import the existing spreadsheet (Priority: P3)

A member imports the household's spreadsheet (one sheet per month) to bring their history into the app. Before anything is saved, a preview shows, for each sheet, which month it becomes and how each row is mapped to a group, a kind, a category and the members' amounts. The member fixes the mapping where needed, sees rows that could not be read, then confirms.

**Why this priority**: Valuable for adoption and history, but a household can start using the app from the current month without it.

**Independent Test**: Import a spreadsheet with 3 monthly sheets including a cell containing the text "12,5"; check that the preview maps the rows, that "12,5" is read as 12,50 € and counted, that totals recomputed by the app are shown next to the spreadsheet's own totals with differences highlighted, and that nothing is saved before confirmation.

**Acceptance Scenarios**:

1. **Given** a spreadsheet file, **When** the member imports it, **Then** a preview lists each sheet with the proposed month and, per row, the proposed group, kind, label and per-member amounts.
2. **Given** a cell holding the text "12,5", **When** it is imported, **Then** it is read as 12,50 € and included in totals.
3. **Given** a row whose amount cannot be read, **When** the preview is shown, **Then** the row is flagged and the member must fix or explicitly skip it before confirming.
4. **Given** the spreadsheet's own totals differ from the app's recomputation (e.g. Maëlle's left 144,26 € vs −6,84 €), **When** the preview is shown, **Then** both values are displayed with the difference highlighted.
5. **Given** a sheet for a month that already exists in the budget, **When** the preview is shown, **Then** that sheet is skipped by default and labelled "already exists".
6. **Given** the member cancels the preview, **Then** nothing is saved.
7. **Given** an Excel (.xlsx) or OpenDocument (.ods) file, **When** the member imports it, **Then** it is read; **Given** any other file type, **Then** it is refused with a message listing the supported formats (files from Google Sheets, Numbers or LibreOffice are exported to one of these first).

---

### Edge Cases

- **Text amounts and separators**: `12,5`, `12.5`, `1 234,56`, `1234.56` are accepted; more than two decimals, letters, empty-but-required, or two decimal separators are rejected with a message. An amount is never stored as text and never silently left out of a total.
- **Every line counted once**: Each member's DCR and DCE totals always include every shared line of the month, including lines where that member's share is 0 €. Household total planned always equals the sum over members of DI + DCR + DCE.
- **Odd cents**: Equal and proportional splits and periodic amounts are rounded to the cent with a single documented rule; shares always add up exactly to the line total (largest-remainder method, ties broken by member order in the budget).
- **Periodic rounding drift**: "80 € per year" gives 6,67 €/month (80,04 €/year); the hint shows the formula so the drift is understood. The monthly amount is what is counted.
- **Proportional with no income**: If the household-counted income of the month is 0 €, "proportional to income" cannot be chosen (or, if already chosen, the line is flagged "needs income" and its shares fall back to the last valid values until incomes are entered).
- **Zero and negative amounts**: 0 € is allowed (a member contributes nothing). Negative amounts are refused on budget lines and income lines; refunds are entered as income lines.
- **Members joining or leaving**: Per spec 002 FR-033, a member who leaves stays in the month they left; months created afterwards do not include them. On copy, their custom shares are removed and the affected lines are flagged "to review" before the month can be marked Active; equal and proportional lines are recomputed among remaining members. A member who joins appears in the current month with no lines; equal and proportional lines are recomputed to include them and the change is recorded in the history.
- **Viewers**: Viewers have no column, no income and no shares; they see the month read-only (private lines hidden as for members).
- **Moving a line between groups**: Moving a shared line to Personal requires choosing its owner; moving a personal line to a shared group requires a split. Private status is removed when a line leaves Personal.
- **Concurrent edits**: If two members edit the same line at the same time, the second save is not applied blindly: the member sees the newer value and decides whether to keep theirs. Edits to different lines never conflict.
- **Closed month**: All edits (lines, incomes, order, splits) are refused until reopened; the change history stays readable.
- **Category deleted while in use**: Lines in that category become uncategorized; nothing else changes.
- **Envelope sub-items**: Sub-item amounts are optional; when given, their sum may not exceed the line's total.
- **Large household**: Summary and line editing remain usable with up to 6 members (spec 002).
- **Offline**: When the device is offline, the month is readable from its last known state and editing is disabled with a visible notice.
- **Very large amounts**: Amounts above 1 000 000,00 € per line are refused as a likely typo.

## Requirements *(mandatory)*

### Functional Requirements

**Months**

- **FR-001**: The system MUST organize planning by budget month, using the budget's month start day (spec 002 FR-004), with one month record per period per budget, labelled in French by month and year (e.g. "Novembre 2026").
- **FR-002**: A month MUST have a status Draft, Active or Closed. Allowed transitions: Draft → Active, Active → Closed, Closed → Active (reopen). No other transition is allowed.
- **FR-003**: Owner, Admins and Members MUST be able to mark a month Active and to close an Active month. Only the Owner and Admins MUST be able to reopen a Closed month. Viewers MUST NOT change status.
- **FR-004**: Users with edit rights MUST be able to create a month for any period that does not yet have one, from: the previous month, any past month, a saved template, or scratch.
- **FR-005**: Creating from a source month MUST copy all Personal and Recurring shared lines with their label, group, kind, category, split mode, per-member amounts, periodic formula, envelope flag, sub-items, privacy flag and order, using each line's usual value (not a "this month only" exception). One-off shared lines MUST NOT be copied, except when duplicating a past month with the "also copy one-off lines" option.
- **FR-006**: Creating from a source month MUST pre-fill each member's income lines from the source, each marked "to confirm" until that member confirms or edits it. Pre-filled incomes MUST count in the totals immediately.
- **FR-007**: Users MUST be able to save any month as a named template (its budget lines, without incomes) and to rename and delete templates.
- **FR-008**: Users MUST be able to list all months of the budget, newest first, with status and each member's "what's left", and open any of them.

**Incomes**

- **FR-009**: Each member MUST be able to add, edit and delete their own income lines for a month, each with a label, an amount and a "counts toward the household budget" flag (on by default).
- **FR-010**: Income lines MUST be visible to everyone in the budget (spec 002 FR-025a) and editable only by the member they belong to.
- **FR-011**: The spec 002 income prompt after joining MUST create the member's first income line in the current month.

**Budget lines**

- **FR-012**: Users with edit rights MUST be able to add, edit, reorder within a group, move between groups, and delete budget lines, subject to FR-018.
- **FR-013**: Every budget line MUST have a label (1–60 characters after trimming), a group (Personal, Recurring shared, One-off shared) and a kind (expense or savings, default expense).
- **FR-014**: A budget line MAY have a category chosen from the budget's category list. Each budget MUST start with Housing, Food, Transport, Pets, Leisure, Health, Subscriptions, Savings, Gifts, Other (shown in French), and the Owner, Admins and Members MUST be able to add, rename and delete categories.
- **FR-015**: A budget line MAY be flagged as an envelope (tracked against actual transactions in feature 04) and MAY have sub-items, each with a label and an optional amount; the sum of sub-item amounts MUST NOT exceed the line's total.
- **FR-016**: A Personal line MUST belong to exactly one member and hold only that member's amount.
- **FR-017**: A shared line (Recurring or One-off) MUST hold one amount per contributing member of the month, and a split mode: custom amounts (default), equal, proportional to household-counted income, or one member pays everything (with the member chosen).
- **FR-018**: A Personal line MUST be editable, movable and deletable only by its owner. Other people in the budget MUST see it read-only.
- **FR-019**: The owner of a Personal line MUST be able to mark it private. Others MUST NOT see a private line's label, amount, category, sub-items or history details; they MUST see one "Private" row per member with the summed amount of that member's private lines, included in that member's totals.
- **FR-020**: For a shared line, the user MUST be able to enter either the total (shares computed from the split mode) or the per-member amounts (total computed). A line whose shares do not add up exactly to its total MUST NOT be saved, and the difference MUST be shown.
- **FR-021**: Equal and proportional splits MUST be computed in whole cents with a deterministic, documented remainder rule (largest remainder, ties broken by member order) so that shares always add up exactly to the total.
- **FR-022**: Proportional splits MUST use each member's household-counted income for that month and MUST be recomputed whenever an income of that month changes, while the month is not Closed.
- **FR-023**: A line amount MAY be entered as a periodic formula: per year (÷ 12), per half-year (÷ 6), per quarter (÷ 3), or a multiplier ("47 € × 2"). The system MUST store the resulting monthly amount, rounded to the cent half-up, together with the original formula, and MUST show the formula as a hint (e.g. "80 €/an ÷ 12").
- **FR-024**: When editing the amount, split or formula of a recurring line (Personal or Recurring shared), the user MUST choose "from this month on" (the new value becomes the line's usual value) or "this month only" (the line is marked as an exception for this month and its usual value is kept).
- **FR-025**: A "from this month on" change MUST also be applied to later months of the same recurring series that already exist, only if they are in Draft and their value for that line was not edited by hand in that month; Active and Closed later months MUST NOT change. Each update MUST be recorded in the affected month's history.

**Amount input**

- **FR-026**: Amount fields MUST accept a comma or a dot as decimal separator and spaces as thousands separators, MUST reject anything else (letters, more than two decimals, several decimal separators, negative values, values above 1 000 000,00 €), and MUST never store raw text in place of an amount.
- **FR-027**: All amounts in a month MUST be in the budget's single currency.

**Computed figures**

- **FR-028**: For each contributing member and each month, the system MUST compute:
  - household-counted income = sum of their income lines flagged "counts";
  - non-counted income = sum of their other income lines (shown separately);
  - DI = sum of their Personal lines (expense and savings);
  - DCR = sum of their shares of all Recurring shared lines;
  - DCE = sum of their shares of all One-off shared lines;
  - what's left = household-counted income − DI − DCR − DCE;
  - transfer to joint account = DCR + DCE;
  - savings total = sum of their amounts on savings lines in any group;
  - savings rate = savings total ÷ household-counted income, shown as a percentage with one decimal, or "—" when that income is 0.
- **FR-029**: For each month the system MUST compute household totals: total income (counted and not counted), total planned (sum of all lines), total what's left (sum of members' what's left), total transfer and total savings.
- **FR-030**: Every computed figure MUST include every line and every income line of the month exactly once; the household total planned MUST equal the sum over members of DI + DCR + DCE.
- **FR-031**: The summary MUST be visible while editing and MUST update immediately after each change, for every member's column.
- **FR-032**: A negative "what's left" MUST be shown with a warning icon and a text label, not by color alone.

**Collaboration and history**

- **FR-033**: Changes saved by one person MUST appear on the screens of the other people viewing the same month within 5 seconds.
- **FR-034**: When two people edit the same line concurrently, the system MUST NOT silently overwrite a newer value; the second person MUST see the newer value and decide whether to apply theirs.
- **FR-035**: Every change to a month's lines, incomes, splits, order and status MUST be recorded with who, when, the item, and the old and new values (constitution Principle I). Once a month is Active, these records MUST be shown as a change history readable by everyone in the budget, phrased like "Fabien changed Courses from 280,00 € to 300,00 €". Changes to private lines MUST appear to others as "{member} changed a private line".

**Closing**

- **FR-036**: Closing a month MUST freeze its lines, incomes and computed figures; any edit on a Closed month MUST be refused with an explanation.
- **FR-037**: A Closed month MUST show planned vs actual per line and per total when transactions exist for it (feature 04), and planned figures only otherwise.
- **FR-038**: Reopening MUST return the month to Active and be recorded in the history.

**Import**

- **FR-039**: Users with edit rights MUST be able to import a spreadsheet where each sheet is one month, in Excel (.xlsx) or OpenDocument (.ods) format; other file types MUST be refused with a message listing the supported formats.
- **FR-040**: The import MUST show a preview before saving, mapping each sheet to a month and each row to a group, kind, label, category (when guessable) and per-member amounts, and MUST let the user correct every mapping.
- **FR-041**: The import MUST parse amounts with the same rules as FR-026 (including text such as "12,5"), MUST flag rows it cannot read, and MUST NOT allow confirming until each flagged row is fixed or explicitly skipped.
- **FR-042**: The preview MUST show the app's recomputed totals per member next to the totals found in the sheet (when present) and highlight differences.
- **FR-043**: Sheets for months that already exist MUST be skipped by default. Imported past months MUST be created as Closed; an imported current or future month MUST be created as Draft. Nothing MUST be saved if the user cancels.

**Access**

- **FR-044**: All month, line, income, template and history data MUST follow spec 002 access rules: only current people of the budget can read it, Viewers cannot write, and a non-member is refused without learning whether the month exists.
- **FR-045**: Notifications, logs and analytics related to this feature MUST NOT contain amounts or labels (constitution Principle III).

### Key Entities

- **Budget month**: One planning period of a budget. Period (from the month start day), label, status (Draft, Active, Closed), source it was created from (previous month, past month, template, scratch, import), contributing members, frozen figures once Closed.
- **Income line**: Belongs to one member and one month. Label, amount, "counts toward the household budget" flag, "to confirm" flag when pre-filled.
- **Budget line**: Belongs to one month. Label, group (Personal, Recurring shared, One-off shared), kind (expense, savings), optional category, envelope flag, order within its group, owner (Personal only), private flag (Personal only), split mode, periodic formula (optional), "this month only" exception marker with the usual value it overrides.
- **Member share**: The amount one member puts toward one budget line in one month. Shares of a line always add up to its total.
- **Recurring series**: Links the copies of the same recurring line across months, carrying its usual value, so "from this month on" and "this month only" can be applied.
- **Envelope sub-item**: Label and optional amount under an envelope line.
- **Category**: Per-budget list of names, seeded with the default list.
- **Month template**: Named, per-budget set of budget lines (no incomes) used to create a month.
- **Change record**: Who, when, which month and item, old and new values, and whether the item is private.
- **Import session**: A spreadsheet being imported: sheets, proposed month per sheet, row mappings, flagged rows, sheet totals vs recomputed totals, confirmed or cancelled.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A household member creates a new month from the previous one, confirms incomes, adjusts up to 3 amounts and adds 2 one-off lines in under 3 minutes (median, usability test with at least 5 participants, month of at least 25 lines).
- **SC-002**: For 100% of randomly generated months (at least 1 000 per test run, 1 to 6 members, 0 to 80 lines, all split modes, odd cents, periodic formulas, amounts typed with comma or dot), every computed figure equals an independent manual recomputation from the lines, to the cent.
- **SC-003**: Entering the Novembre 2026 example produces exactly: Maëlle what's left −6,84 € flagged as negative, transfer 1 862,52 €; Fabien what's left 158,16 €, transfer 2 242,52 €.
- **SC-004**: When two members view the same month, a change saved by one appears for the other within 5 seconds in at least 95% of attempts on a normal mobile connection.
- **SC-005**: Zero amounts are ever stored as text or left out of a total: 100% of invalid inputs are refused with a message, and 100% of valid inputs are counted.
- **SC-006**: A household can import 12 months of spreadsheet history, reviewing the preview, in under 15 minutes, with every row either imported or explicitly skipped.
- **SC-007**: Every negative "what's left" is shown with an icon and text label on every screen that shows it (verified by UI review in light and dark mode at the largest font size).

## Assumptions

- Users, budgets, roles (Owner, Admin, Member, Viewer), the month start day and the 6-person limit come from specs 001 and 002. "Owner can reopen" is extended to Admins, consistent with spec 002's Admin definition (everything except deleting the budget and ownership changes).
- Contributing members of a month are the budget's Owner, Admins and Members during that month; Viewers never contribute.
- Shared lines are editable by every Owner, Admin and Member, including the other members' shares; only Personal lines and income lines are restricted to their owner.
- Constitution Principle I requires every change to be traceable, so changes are recorded in all statuses; the user-facing change history highlights changes made after the month became Active.
- A month can be closed at any time once Active; the app does not auto-close months. Active cannot go back to Draft.
- More than one month can be open (Draft or Active) at once, so a household can prepare next month before closing the current one.
- Templates hold budget lines only (all groups), not incomes.
- Remainder cents of equal and proportional splits go to members with the largest fractional parts, ties broken by member order in the budget; periodic amounts round half-up to the cent.
- Actual spending, envelope tracking and transactions are defined in feature 04; this feature only displays planned vs actual when that data exists.
- Editing requires a network connection; offline editing is out of scope for this feature.
- Out of scope: connecting to bank accounts, multiple currencies within one budget, AI-assisted import or categorization.
