# Feature Specification: Transaction Tracking

**Feature Branch**: `004-transaction-tracking`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "The plan (feature 03) says what we intend to spend; this feature records what we actually spend, so we can compare. The current spreadsheet has an 'actual tracking' section and envelope tables for groceries, fuel and the pet shop, but they stay empty because recording spending is too tedious. Recording must be extremely fast. Transaction: date, amount, label, who paid (a member or the joint account), payment method (personal card, joint card, meal voucher, cash, transfer), budget line (or none), optional sub-item, optional note/photo of the receipt, planned or unplanned (prévu / imprévu; linked to a line defaults to planned, no line defaults to unplanned). Stories: quick add from a persistent '+' (keypad first, then label, then line from most used; date today, payer me); line suggested from label; offline recording with sync; edit/delete seen by partner; month's transaction list with filters and search; envelope spent/remaining with progress, warning over 80%, 'over budget' over 100%; shared expense paid personally with who-owes-whom and mark settled; meal-voucher spending counted against own meal-voucher income; recurring transactions created automatically each month; CSV bank import with duplicate detection and review. Planned vs actual per line, group and month (amount and %); lines without transactions are 'not tracked' unless marked 'Paid as planned'. Edge cases: refunds, split across two lines, transaction dated in a closed month, deleting a line with transactions. Success: median time to record under 10 seconds; at least 80% of label-based line suggestions accepted after one month."

## Clarifications

### Session 2026-11-17

- Q: How is a shared expense paid personally divided between members for rebalancing? → A: By the line's planned per-member split for that month; equally when there is no line.
- Q: Does a shared expense paid with a member's meal vouchers create a debt from the other member(s)? → A: Yes, same as a personal card payment.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record a transaction in a few seconds (Priority: P1)

From any screen, a member taps the persistent "+" button. A keypad opens with focus on the amount. They type `42,30`, then a label ("Leclerc"), then pick the budget line from a short list of their most used lines (or accept the suggested one). The date is today, the payer is them, the payment method is their usual one for that payer, and the transaction is marked planned because it has a line. One tap saves it, with a haptic confirmation. Everything else (date, payer, method, sub-item, note, receipt photo, planned/unplanned) can be changed on the same sheet before saving, but nothing else is required.

**Why this priority**: Recording spending is the reason this feature exists. If it is not faster than forgetting, actuals stay empty, exactly as in the spreadsheet (constitution Principle IV).

**Independent Test**: With a month containing a "Courses" line, open the app, tap "+", type `42,30`, type "Leclerc", tap "Courses", save; check that the transaction is stored for today, paid by the current member, linked to "Courses", marked planned, and that "Courses" actual increased by 42,30 €. Time the flow: under 10 seconds.

**Acceptance Scenarios**:

1. **Given** a member on any screen of the app, **When** they tap "+", **Then** the quick-add sheet opens with the amount keypad focused, without first choosing a month or a screen.
2. **Given** the quick-add sheet, **When** the member types `42,30`, `42.3` or `1 042,30`, **Then** the amount is read as 42,30 €, 42,30 € or 1 042,30 €; **When** they type an amount with more than two decimals or letters, **Then** it cannot be saved and the field explains why.
3. **Given** the member has entered an amount and a label, **When** the line picker is shown, **Then** it lists at most 6 lines of the transaction's month, ordered by how often this member used them in the last 90 days, plus "No line" and "All lines…".
4. **Given** a transaction linked to a line, **When** it is saved without touching the planned/unplanned toggle, **Then** it is marked planned; **Given** a transaction with no line, **Then** it is marked unplanned. The member can flip the toggle in either case.
5. **Given** a member saves without changing date or payer, **Then** the date is today (device local date) and the payer is that member.
6. **Given** a line with sub-items (e.g. "Animalerie": croquettes, litière), **When** the member picks that line, **Then** they can optionally pick a sub-item; skipping it is allowed.
7. **Given** a member attaches a receipt photo or a note, **When** the transaction is saved, **Then** the photo and note are stored with it and visible from the transaction's detail.
8. **Given** a Viewer, **Then** the "+" button is not shown and recording is refused.

---

### User Story 2 - See planned vs actual and envelope progress (Priority: P1)

For the month, each budget line, each group and the whole month show planned, actual, and the difference (amount and percentage). Envelope lines (e.g. Courses 400 €, Carburant 200 €, Animalerie 120 €) show spent / remaining with a progress bar and the list of their transactions. Above 80% the envelope shows a warning; above 100% it shows "over budget" with the amount over. Lines with no transaction are shown as "not tracked" instead of "0 € spent", and a member can mark a fixed cost (rent, insurance) as "Paid as planned" in one tap.

**Why this priority**: Comparing the plan with reality is the purpose of recording. Envelopes are the tables the household wanted to fill in the spreadsheet.

**Independent Test**: With Courses 400 €, record 250 € then 80 € then 90 €; check spent 250 € / remaining 150 € (no warning), then 330 € / 70 € with a warning (82,5%), then 420 € with "over budget by 20,00 €". Leave "Loyer" without transactions and check it reads "not tracked"; tap "Paid as planned" and check its actual equals its planned amount.

**Acceptance Scenarios**:

1. **Given** an envelope line "Courses" planned 400 € with 250 € of transactions, **When** a member opens it, **Then** it shows spent 250,00 €, remaining 150,00 €, a progress bar at 62,5%, and the list of its transactions, newest first.
2. **Given** spending reaches 330 € on a 400 € envelope, **Then** the envelope shows a warning icon and text (82,5%), not color alone.
3. **Given** spending reaches 420 € on a 400 € envelope, **Then** it shows "over budget" with "+20,00 €" and an icon, and remaining reads 0 € with the overrun stated separately.
4. **Given** a line "Loyer" planned 950 € with no transaction, **When** planned vs actual is shown, **Then** the line reads "not tracked", and it is excluded from the actual and difference totals, which state how many lines are not tracked.
5. **Given** "Loyer" not tracked, **When** a member taps "Paid as planned", **Then** a transaction of 950 € linked to "Loyer" is created (label "Loyer", today's date, payer joint account, method transfer, planned), and the line now reads actual 950 €, difference 0 €.
6. **Given** a group (e.g. Recurring shared) and the whole month, **When** planned vs actual is shown, **Then** each shows planned, actual and difference in amount and percentage, computed over tracked lines, with planned of all lines shown too.
7. **Given** transactions with no line, **Then** they appear in a separate "Unassigned" row of the month's actual total, not inside any group.

---

### User Story 3 - Record offline and sync later (Priority: P1)

In a shop with no signal, a member records a transaction. It is saved on the device right away and marked "waiting to sync". When the connection returns, it is sent automatically; the partner then sees it.

**Why this priority**: Spending happens in shops, car parks and petrol stations, often with poor signal. If recording fails there, the habit breaks.

**Independent Test**: Turn on airplane mode, record two transactions, close and reopen the app, check both are listed as "waiting to sync"; turn the network back on and check they sync once each (no duplicates) and appear on the partner's device.

**Acceptance Scenarios**:

1. **Given** the device is offline, **When** a member records a transaction, **Then** it is saved locally, shown in the list with a "waiting to sync" marker, and counted in the totals shown on that device.
2. **Given** pending transactions, **When** the app is closed and reopened offline, **Then** they are still there.
3. **Given** the connection returns, **When** sync runs, **Then** each pending transaction is stored exactly once, even if the sync is retried.
4. **Given** a pending transaction whose month was closed by the partner in the meantime, **When** it syncs, **Then** the member is asked to reopen the month (if allowed) or move it to the current month; it is never lost or silently moved.
5. **Given** a pending transaction linked to a line the partner deleted in the meantime, **When** it syncs, **Then** it is stored as unassigned and flagged for review.

---

### User Story 4 - Line suggested from the label (Priority: P2)

When the member types a label, the app proposes the budget line used most recently for similar labels in past transactions ("Leclerc" → Courses, "Total" → Carburant). The suggestion is preselected; the member can accept it by saving or pick another line.

**Why this priority**: Removes the slowest step of quick add for repeated merchants. The flow works without it (the most-used list), so it comes after P1.

**Independent Test**: Record three transactions "Leclerc" → Courses; on the fourth, type "leclerc" and check "Courses" is preselected. Record "Leclerc" → Maison once; check the suggestion follows the documented rule.

**Acceptance Scenarios**:

1. **Given** past transactions "Leclerc" linked to "Courses", **When** a member types "leclerc" or "LECLERC ", **Then** "Courses" is preselected (labels compared ignoring case, accents and surrounding spaces).
2. **Given** a label never seen before, **Then** no line is preselected and the most-used list is shown.
3. **Given** the suggested line does not exist in the transaction's month, **Then** no line is preselected.
4. **Given** a suggestion, **When** the member saves with a different line, **Then** that choice counts for future suggestions, and the event "suggestion accepted / changed" is recorded without the label or amount (for SC-002).
5. **Given** suggestions use the household's history, **Then** labels from another member's private line transactions are never used to suggest lines to someone else.

---

### User Story 5 - Browse, edit and delete the month's transactions (Priority: P2)

A member opens the month's transaction list, newest first, grouped by day. They filter by member involved, payer, budget line, group, planned/unplanned, and search by label. They open a transaction to edit any field or delete it; their partner sees the change.

**Why this priority**: Mistakes happen while recording fast; fixing them must be easy. Filters answer "what did we spend at the pet shop this month?".

**Independent Test**: With 30 transactions, filter payer = joint account and group = Recurring shared, search "total"; check only matching ones show with their sum. Edit one amount; check the partner sees it within 5 seconds and the change history records it.

**Acceptance Scenarios**:

1. **Given** a month with transactions, **When** a member opens the list, **Then** transactions show date, label, amount, line (or "Unassigned"), payer and planned/unplanned, newest first, with the total of the listed transactions.
2. **Given** filters for payer, member, line, group and planned/unplanned plus a label search, **When** the member combines them, **Then** only transactions matching all of them are listed and the total reflects them.
3. **Given** a transaction, **When** a member with edit rights changes its amount, line, date or any other field, **Then** the change is saved, totals update, the partner sees it within 5 seconds, and the change is recorded (who, when, old and new values).
4. **Given** a transaction, **When** a member deletes it, **Then** they confirm, it disappears for everyone, totals update, and the deletion is recorded in the history with an "undo" available for 10 seconds.
5. **Given** two members edit the same transaction concurrently, **Then** the second save is not applied blindly; that member sees the newer values and decides.

---

### User Story 6 - Shared expense paid personally and who owes whom (Priority: P2)

Fabien pays 104,47 € at Leclerc with his personal card for the household's groceries. He records it with payer "Fabien" on the shared line "Courses". The month's summary shows a balance between members ("Maëlle owes Fabien 23,40 €"), netting every shared expense paid personally that month. When they settle (e.g. a bank transfer), a member marks the balance as settled.

**Why this priority**: This already happens today and is settled by memory. It is valuable but needs the transaction basics first.

**Independent Test**: With a "Courses" line split Maëlle 100 € / Fabien 300 €, record 104,47 € paid by Fabien on Courses and 40 € paid by Maëlle on a shared line split equally; check the balance follows the documented rule, is netted into a single "X owes Y" amount, and that marking it settled brings it to 0 € and records the settlement.

**Acceptance Scenarios**:

1. **Given** a transaction paid by a member on a shared line, **Then** it counts in that line's actual like any other, and it adds to the month's balance between members according to the line's planned split for that month (e.g. Courses planned Maëlle 100 € / Fabien 300 €: Maëlle owes 25% of 104,47 € = 26,12 €); a shared transaction with no line is divided equally among contributing members.
2. **Given** several shared expenses paid personally by both members in a month, **Then** the summary shows one netted amount per pair of members ("Maëlle owes Fabien 23,40 €"), and the list of transactions behind it.
3. **Given** a transaction with no line paid personally, **When** the member records it, **Then** they can mark it "for the household" (shared) or not; it is personal by default.
4. **Given** a balance of 23,40 €, **When** a member marks it settled, **Then** a settlement of 23,40 € is recorded with who and when, the balance becomes 0 €, and later shared expenses start a new balance.
5. **Given** a settled balance, **When** a transaction included in it is edited or deleted, **Then** the difference appears as a new open balance; the past settlement is never changed.
6. **Given** a transaction paid by the joint account, **Then** it never creates a balance between members.

---

### User Story 7 - Meal-voucher spending (Priority: P3)

Maëlle pays lunch or groceries with her Swile card. She records it with payment method "meal voucher". The app counts it against her own meal-voucher income for the month and shows what remains on her vouchers.

**Why this priority**: Meal vouchers are a real part of the household's money but a smaller one; tracking works without this.

**Independent Test**: Maëlle has a meal-voucher income line of 160 € in the month; record 12,50 € and 45,00 € paid with meal vouchers; check her voucher balance shows 102,50 € remaining, and that the transactions count toward their lines' actual.

**Acceptance Scenarios**:

1. **Given** a member with a meal-voucher income line, **When** they record a transaction with method "meal voucher", **Then** the payer is that member (the joint account cannot pay with meal vouchers) and their meal-voucher remaining decreases by the amount.
2. **Given** meal-voucher spending exceeds the member's meal-voucher income for the month, **Then** the remaining shows a negative amount with a warning icon and text.
3. **Given** a meal-voucher transaction on a shared line, **Then** it counts in that line's actual and creates amounts owed to that member exactly like a personal card payment (User Story 6).
4. **Given** a member with no meal-voucher income line, **When** they choose "meal voucher", **Then** the transaction is allowed and the voucher remaining shows as negative with a hint to add the income line.

---

### User Story 8 - Recurring transactions (Priority: P3)

A member sets up "Loyer, 950 €, on the 5th, paid by the joint account by transfer, line Loyer". Each month, on the 5th, the transaction is created automatically and linked to that month's "Loyer" line.

**Why this priority**: Saves the fixed costs from being "not tracked" without any tapping, but "Paid as planned" already covers this manually.

**Independent Test**: Create a recurring "Loyer" on the 5th; when Décembre exists and the 5th arrives, check one transaction of 950 € is created, linked to Décembre's "Loyer", and marked "recurring". Edit the rule's amount to 980 € "from next occurrence" and check past ones are unchanged.

**Acceptance Scenarios**:

1. **Given** a recurring transaction rule (label, amount, day of month, payer, method, line), **When** that day arrives in a month that exists, **Then** exactly one transaction is created, linked to the same recurring line in that month, marked planned and "recurring".
2. **Given** a rule on the 31st, **When** the month has fewer days, **Then** the transaction is created on the last day of the month.
3. **Given** the month did not exist on that day, **When** it is created later, **Then** the missed recurring transactions are created at that time with their scheduled dates.
4. **Given** the rule's line does not exist in that month, **Then** the transaction is created unassigned and flagged for review.
5. **Given** a rule is edited or stopped, **Then** only future occurrences change; already created transactions are kept as they are.
6. **Given** the month is Closed on the scheduled day, **Then** no transaction is created in it, and members are notified that one was skipped.

---

### User Story 9 - Import a bank CSV export (Priority: P3)

A member imports a CSV export from their bank (personal or joint account). The app reads dates, amounts and labels, suggests a line for each row, flags likely duplicates of transactions already recorded, and shows a review screen. Nothing is saved until the member confirms.

**Why this priority**: Catches what was forgotten during the month and helps adoption, but the quick add is the primary path.

**Independent Test**: Record "Leclerc 104,47 €" on 12/11 manually; import a CSV containing the same purchase plus 20 others; check the matching row is flagged as a duplicate and unchecked, other rows show suggested lines, and nothing is saved before confirmation. Re-import the same file and check every row is flagged as duplicate.

**Acceptance Scenarios**:

1. **Given** a CSV file, **When** the member imports it, **Then** they choose which account it comes from (the joint account or their personal account), which sets the payer for every row.
2. **Given** a bank format seen for the first time, **When** the columns are read, **Then** the member maps the date, label and amount columns (or debit/credit columns) once, and the mapping is remembered for later imports of the same format.
3. **Given** the review screen, **Then** each row shows date, label, amount, the suggested line (same rule as User Story 4), planned/unplanned, and a checkbox; debits are checked as expenses, credits are unchecked and proposed as refunds.
4. **Given** a row with the same amount, payer and a date within 3 days of an existing transaction, **Then** it is flagged "possible duplicate", shown next to the existing one, and unchecked by default.
5. **Given** a row whose date or amount cannot be read, **Then** it is flagged and cannot be imported until fixed or skipped.
6. **Given** rows dated in a Closed month, **Then** they are flagged and the member chooses per batch: reopen the month (if allowed), move them to the current month, or skip them.
7. **Given** the member cancels, **Then** nothing is saved.

---

### Edge Cases

- **Refunds**: A refund is a transaction with a negative amount (keypad "refund" toggle). It reduces the actual of its line. A line's actual may go below zero; it is shown as is, never hidden.
- **Split across lines**: A transaction can be split across two or more lines (e.g. a 120 € supermarket receipt: 90 € Courses, 30 € Maison). Parts must add up exactly to the total; the save is refused and the difference is shown otherwise. Each part counts in its own line; the transaction appears once in the list.
- **Date in a Closed month**: The member is told the month is closed and chooses: reopen it (Owner/Admin only, recorded in history) or record the transaction in the current month with today's date. Nothing is recorded in a Closed month silently.
- **Date with no month yet**: If no month exists for the chosen date, the member is offered to create it from the previous month in one tap; otherwise the transaction cannot be recorded for that date.
- **Deleting a line with transactions**: Its transactions become "Unassigned" and are flagged for review; they are never deleted. Deleting a sub-item clears the sub-item on its transactions.
- **Line moved or renamed**: Transactions follow the line; past suggestions point to the line, not to its old name.
- **Payer who left the budget**: Transactions they paid stay attributed to them; open balances involving them stay visible until settled.
- **Privacy**: Transactions linked to a member's private personal line are shown to others only as part of that member's "Private" amount, with no label, note or photo. Transactions on non-private personal lines are visible read-only to others.
- **Zero amount**: Refused. **Very large amounts**: above 1 000 000,00 € refused as a likely typo.
- **Planned/unplanned when line changes**: Changing the line on an existing transaction does not change its planned/unplanned flag automatically once the member has set it by hand.
- **Receipt photo**: Optional, one or more photos up to a size limit; a transaction is fully usable without it. Photos are deleted with the transaction.
- **Offline edits and deletes**: Edits and deletes made offline sync like creations; if the transaction was changed by someone else meanwhile, the concurrent-edit rule applies.
- **Months with several open**: The transaction's month is decided by its date and the budget's month start day, not by the month currently on screen.

## Requirements *(mandatory)*

### Functional Requirements

**Transactions**

- **FR-001**: A transaction MUST have a date, a non-zero amount in the budget's currency, a label (1–60 characters after trimming), a payer (a contributing member or the joint account), a payment method (personal card, joint card, meal voucher, cash, transfer), a planned/unplanned flag, and MAY have one budget line (or a split across several lines), a sub-item of that line, a note (up to 500 characters) and receipt photos.
- **FR-002**: A transaction MUST belong to the budget month whose period contains its date (budget month start day, spec 002 FR-004), regardless of the month shown on screen.
- **FR-003**: Amount input MUST follow spec 003 FR-026 (comma or dot, spaces as thousands separators, at most two decimals, at most 1 000 000,00 €), MUST refuse 0, and MUST accept negative amounts only through an explicit "refund" toggle.
- **FR-004**: A transaction linked to a line MUST default to planned; a transaction with no line MUST default to unplanned. The member MUST be able to override the flag.
- **FR-005**: The payment method MUST default to the payer's most recently used method (joint card for the joint account, personal card for a member, when no history). "Meal voucher" MUST only be allowed when the payer is a member; "joint card" MUST only be allowed when the payer is the joint account.
- **FR-006**: A transaction MAY be split across two or more lines of its month; the parts MUST add up exactly to the transaction amount, and each part counts in its own line's actual.

**Quick add**

- **FR-007**: A persistent "+" control MUST be reachable from every main screen of the app for Owners, Admins and Members, and MUST open the quick-add sheet with the amount keypad focused.
- **FR-008**: Quick add MUST collect amount, then label, then line, with date defaulting to today, payer to the current member, and every other field defaulted, so that a transaction can be saved after entering only amount, label and line.
- **FR-009**: The line picker MUST show at most 6 lines of the transaction's month, ordered by the current member's usage count over the last 90 days, plus "No line" and access to all lines; lines the member cannot use (others' personal lines) MUST NOT be offered.
- **FR-010**: Saving MUST give a haptic and visual confirmation and MUST NOT wait for the network.

**Line suggestion**

- **FR-011**: When a label is entered, the system MUST preselect the line most often chosen for the same normalized label (case, accents and surrounding spaces ignored) in the budget's last 90 days of transactions, ties broken by most recent; if that line does not exist in the transaction's month, nothing is preselected.
- **FR-012**: Suggestions MUST NOT use transactions on another member's private lines.
- **FR-013**: The system MUST record, for each suggestion shown, whether it was kept or changed, without the label, amount or line name (constitution Principle III), so SC-002 can be measured.
- **FR-013a**: Line suggestion is rule-based on the household's own history and sends no data to any model provider (constitution Principle IX does not apply).

**Offline**

- **FR-014**: Members MUST be able to create, edit and delete transactions while offline; changes MUST be saved on the device, marked "waiting to sync", survive app restarts, and be counted in the totals shown on that device.
- **FR-015**: When back online, pending changes MUST sync automatically and MUST be applied exactly once even if sending is retried.
- **FR-016**: If at sync time the target month is Closed, the line no longer exists, or the transaction was changed by someone else, the system MUST ask the member (closed month, concurrent change) or store it as unassigned and flagged (deleted line); it MUST never drop a pending change silently.

**List, edit, delete**

- **FR-017**: Users MUST be able to list a month's transactions newest first, grouped by day, with the total of the listed items, filtered by member involved, payer, line, group, planned/unplanned and "waiting to sync", and searched by label.
- **FR-018**: Owners, Admins and Members MUST be able to edit and delete transactions, except that transactions linked to a member's personal line MUST be editable only by that member. Viewers MUST only read.
- **FR-019**: Deleting a transaction MUST ask for confirmation and offer undo for 10 seconds.
- **FR-020**: Every creation, edit and deletion of a transaction, settlement or recurring rule MUST be recorded with who, when, and old and new values (constitution Principle I), and shown in the month's change history like spec 003 FR-035, with private-line items shown as "{member} changed a private transaction".
- **FR-021**: Changes MUST appear on other members' screens within 5 seconds when both are online, and concurrent edits to the same transaction MUST follow spec 003 FR-034 (no silent overwrite).

**Planned vs actual and envelopes**

- **FR-022**: For each line, the system MUST compute actual = sum of the transaction parts linked to it in that month (refunds subtract), and show planned, actual, difference (actual − planned) and difference as a percentage of planned ("—" when planned is 0).
- **FR-023**: A line with no transaction MUST be shown as "not tracked", not as 0 € spent, and MUST be excluded from actual and difference totals. Group and month figures MUST show planned of all lines, planned and actual of tracked lines, their difference (amount and %), and the number of lines not tracked.
- **FR-024**: Unassigned transactions MUST be shown in a separate "Unassigned" total for the month, included in the month's total actual and excluded from every group.
- **FR-025**: "Paid as planned" on a line MUST create, in one tap, a transaction equal to the line's planned total, labelled with the line's label, dated today, paid by the joint account by transfer for shared lines (by the owner by personal card for personal lines), marked planned. It is an ordinary transaction that can be edited or deleted.
- **FR-026**: For each envelope line, the system MUST show spent, remaining (planned − spent, never below 0), a progress bar, and the line's transactions. Spent above 80% of planned MUST show a warning; above 100% MUST show "over budget" with the amount over. Both states MUST use an icon and text, not color alone.
- **FR-027**: Sub-items MUST show their own spent amount and, when they have an amount, their remaining.

**Shared expenses and balances**

- **FR-028**: A transaction is shared if linked to a shared line (Recurring or One-off shared), personal if linked to a personal line, and for a transaction with no line the member chooses (personal by default).
- **FR-029**: A shared transaction paid by a member MUST create amounts owed by the other contributing members to that member, divided in proportion to the line's planned per-member shares for that month (split parts: per part); a shared transaction with no line, or a line whose planned total is 0 €, MUST be divided equally among contributing members. Transactions paid by the joint account MUST NOT create balances.
- **FR-030**: For each month, the system MUST net all amounts owed between each pair of members, minus settlements, and show one statement per pair ("Maëlle owes Fabien 23,40 €"), with the transactions behind it.
- **FR-031**: Members MUST be able to mark a balance as settled, which records a settlement (amount, who, when) and brings the balance to 0 €. Later edits to included transactions MUST create a new open balance and MUST NOT change the recorded settlement.
- **FR-032**: Shares owed MUST be computed in whole cents with spec 003's remainder rule (largest remainder, ties by member order), so they add up exactly to the transaction amount.

**Meal vouchers**

- **FR-033**: Income lines (spec 003) MUST be markable as "meal voucher" income. For each member and month, the system MUST show meal-voucher remaining = meal-voucher income − meal-voucher spending, with a warning icon and text when negative.
- **FR-034**: Meal-voucher transactions MUST count in their lines' actual like any other transaction; a shared transaction paid with meal vouchers MUST create amounts owed to the paying member exactly like a personal card payment (FR-029).

**Recurring transactions**

- **FR-035**: Owners, Admins and Members MUST be able to create, edit, pause and delete recurring transaction rules with label, amount, day of month (1–31), payer, payment method, and recurring line.
- **FR-036**: On each rule's day (last day of the month when the day does not exist), the system MUST create exactly one transaction in that month, linked to the same recurring line in that month (spec 003 recurring series), marked planned and "recurring", without the app having to be opened.
- **FR-037**: If the month does not exist on that day, missed occurrences MUST be created when the month is created; if the line is missing they MUST be created unassigned and flagged; if the month is Closed no transaction is created and members are notified.
- **FR-038**: Editing, pausing or deleting a rule MUST only affect future occurrences.

**CSV import**

- **FR-039**: Owners, Admins and Members MUST be able to import a CSV bank export, choosing the account it comes from (joint account or their own personal account) which sets the payer.
- **FR-040**: The import MUST let the member map date, label and amount (or debit and credit) columns, MUST detect common French bank conventions (`;` separator, comma decimals, DD/MM/YYYY dates), and MUST remember the mapping per file format.
- **FR-041**: The import MUST show a review screen before saving, with each row's date, label, amount, suggested line, planned/unplanned and an include checkbox; debits included by default, credits excluded by default and proposed as refunds.
- **FR-042**: Rows with the same amount and payer and a date within 3 days of an existing transaction (or a row already imported from an earlier file) MUST be flagged "possible duplicate" and excluded by default.
- **FR-043**: Unreadable rows MUST be flagged and fixed or skipped before confirming; rows dated in a Closed month MUST follow the closed-month rule; nothing MUST be saved if the member cancels.

**Months and lines**

- **FR-044**: A transaction MUST NOT be recorded in a Closed month. The member MUST be offered to reopen it (Owner/Admin, spec 003 FR-038) or to record it in the current month with today's date.
- **FR-045**: Deleting a budget line MUST make its transactions unassigned and flagged for review; it MUST NEVER delete transactions.
- **FR-046**: Closing a month MUST freeze its actual figures along with its planned figures (spec 003 FR-036), and spec 003 FR-037 planned vs actual MUST use the figures of this feature.

**Privacy and access**

- **FR-047**: Transactions, photos, notes, balances and rules MUST follow spec 002 access rules; a non-member is refused without learning whether the data exists.
- **FR-048**: Transactions linked to a private personal line MUST be hidden from others except as part of that member's "Private" amount (spec 003 FR-019).
- **FR-049**: Receipt photos MUST be readable only by people of the budget and MUST be deleted when their transaction is deleted or the budget is deleted.
- **FR-050**: Logs, analytics and notifications MUST NOT contain amounts, labels, notes or photos (constitution Principle III). Bank credentials MUST NEVER be requested; import is from a file only.

### Key Entities

- **Transaction**: Belongs to one budget and one month (from its date). Date, amount (negative for refunds), label, payer (member or joint account), payment method, planned/unplanned flag, shared/personal flag (for unassigned), note, receipt photos, origin (quick add, paid as planned, recurring, CSV import), sync state on the device, created/updated by.
- **Transaction part**: Links a transaction (or a share of it, when split) to one budget line and optional sub-item, with an amount. Parts of a transaction add up to its amount.
- **Balance entry**: Amount one member owes another, derived from a shared transaction paid personally.
- **Settlement**: A recorded payment between two members for a month: amount, from, to, who recorded it, when.
- **Recurring transaction rule**: Label, amount, day of month, payer, payment method, recurring line (spec 003 recurring series), active/paused, and the occurrences it created.
- **Meal-voucher income**: A spec 003 income line flagged as meal voucher; used to compute each member's meal-voucher remaining.
- **CSV import session**: File, chosen account, column mapping, rows with suggested line, duplicate flags, include choice, confirmed or cancelled.
- **Bank format mapping**: Remembered column mapping for a CSV file format, per budget.
- **Suggestion outcome**: Anonymous record that a line suggestion was kept or changed, with no label, amount or line name.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The median time to record a transaction, from tapping "+" (or from opening the app) to the save confirmation, is under 10 seconds (usability test with at least 5 participants, 10 transactions each, using a line from the most-used list).
- **SC-002**: After one month of use, at least 80% of label-based line suggestions are saved without change (measured from suggestion outcomes over the household's last 30 days).
- **SC-003**: At least 80% of the household's envelope lines have at least one transaction per month after two months of use (the spreadsheet tables stayed empty).
- **SC-004**: 100% of transactions recorded offline are synced exactly once after reconnection, with zero lost or duplicated (tested with at least 100 offline transactions and interrupted syncs).
- **SC-005**: For 100% of randomly generated months (at least 1 000 per test run: 1 to 6 members, 0 to 300 transactions, refunds, split transactions, all payers and methods), every actual, difference, envelope remainder, voucher remaining and balance between members equals an independent manual recomputation, to the cent.
- **SC-006**: A change saved by one member appears for the other within 5 seconds in at least 95% of attempts on a normal mobile connection.
- **SC-007**: Importing a 100-row CSV, reviewing and confirming takes under 5 minutes, with 100% of re-imported rows flagged as possible duplicates.
- **SC-008**: Every warning and over-budget state is shown with an icon and text on every screen that shows it (UI review in light and dark mode, largest font size).

## Assumptions

- Users, budgets, roles, the month start day and the 6-person limit come from specs 001 and 002; months, lines, groups, envelopes, sub-items, recurring series, privacy, change history and closing come from spec 003.
- "Who paid" choices are the month's contributing members plus one joint account per budget. Multiple joint accounts are out of scope.
- The joint account is not tracked as a bank balance; the app records what was paid from it, not its balance.
- Shared lines and their transactions are editable by every Owner, Admin and Member (same rule as spec 003 shared lines); personal-line transactions only by their owner.
- "Most used lines" are per member; suggestions from labels use the whole household's (non-private) history so both members benefit from each other's recordings.
- "Over 80%" and "over 100%" are strict: exactly 80% has no warning, exactly 100% is fully spent but not over budget.
- "Paid as planned" is implemented as an ordinary transaction so totals, history and undo behave the same everywhere.
- Recurring transactions are created by the system on schedule even if nobody opens the app.
- CSV is the only import format; OFX/QIF and direct bank connections are out of scope (constitution Principle III: no bank credentials).
- Receipt photos are for reference only; reading amounts from photos (OCR) is out of scope.
- Spec 003 "editing requires a network connection" still applies to budget lines and months; only transactions are editable offline.
- Spec 003 refuses negative amounts on budget lines; refunds here are transactions, which does not conflict.
