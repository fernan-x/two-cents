# Feature Specification: Shared Budgets & Membership

**Feature Branch**: `002-shared-budgets`

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "A budget is a shared space owned by a household (for example "Maison Maëlle & Fabien"). A user can belong to several budgets and switch between them. Create a budget (name, currency, month start day); invite by email (email + push) or by link / 6-character code (7 days, single use); invitee sign-up then invitation screen with Accept / Decline; income prompt after accepting; manage pending invitations; change roles, remove members, transfer ownership, leave; budget picker reopening on the last budget used. Roles Owner / Member / Viewer. Exactly one owner. Former members stay in history. Deleting a budget requires typing its name and notifies members. Optimized for 2 members, works up to 6. Partner joins in under 2 minutes; nobody outside a budget can read its data."

## Clarifications

### Session 2026-11-16

- Q: Who can invite new people to a budget? → A: Owner and a new Admin role. Admin can do everything the owner can except delete the budget, transfer ownership, or change/remove the owner. Admins can promote others to Admin.
- Q: Should members see each other's monthly income amounts? → A: Yes. Every person in the budget (Owner, Admin, Member, Viewer) sees every member's income.
- Q: Does someone who leaves or is removed mid-month still count in that month's split? → A: Yes. They stay in the current budget month and are excluded from the next budget month onwards.
- Q: Is budget deletion immediate or recoverable? → A: Hidden from everyone at once; the owner can restore it within 30 days; then permanently erased.
- Q: How does an invitee without the app reach the invitation after installing? → A: The invite page shows the 6-character code; right after sign-up the app asks "Got an invitation code?" (skippable). No automatic detection after install.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a budget (Priority: P1)

A signed-in user creates a budget by giving it a name (e.g. "Maison Maëlle & Fabien"), a currency (EUR by default) and the day the budget month starts (1st by default; e.g. the 28th for households who count from payday). The creator becomes its owner and lands in it.

**Why this priority**: Nothing else in the app exists without a budget. A single user with one budget is already a usable MVP.

**Independent Test**: Sign in, create a budget with default settings, and confirm it opens with the creator listed as owner and the current budget month computed from the chosen start day.

**Acceptance Scenarios**:

1. **Given** a signed-in user with no budget, **When** they create a budget named "Maison Maëlle & Fabien" without changing anything else, **Then** the budget exists with currency EUR, month start day 1, the user as sole owner, and it opens.
2. **Given** a user creating a budget, **When** they choose month start day 28, **Then** on 16 November the current budget month is shown as 28 October – 27 November.
3. **Given** a user creating a budget, **When** they submit an empty or whitespace-only name, **Then** creation is refused with a clear message.
4. **Given** a user who already has one budget, **When** they create a second one ("Chatterie"), **Then** both appear in their budget picker and the new one opens.

---

### User Story 2 - Invite the partner and have them join (Priority: P1)

The owner invites their partner, either by email or by sharing a link / 6-character code by text message. The partner opens the link, creates an account if needed, sees which budget they are invited to and by whom, accepts, and is asked for their monthly income for the current month (skippable).

**Why this priority**: Sharing is the reason the app exists. The headline success criterion (partner joins in under 2 minutes) lives here.

**Independent Test**: From an owner account, send an invitation; from a fresh device with no account, open the link, sign up, accept, enter or skip income, and confirm both accounts now see the same budget.

**Acceptance Scenarios**:

1. **Given** an owner or Admin, **When** they invite `partner@example.com`, **Then** that address receives an email containing a link to the invitation, and the invitation appears as pending.
2. **Given** the invited email already belongs to an account, **When** the invitation is sent, **Then** that user also receives a push notification (if they allowed notifications) that opens the app on the invitation screen.
3. **Given** an owner or Admin, **When** they generate a code invitation, **Then** they get a link and a 6-character code they can share through the phone's share sheet, valid for 7 days and for one person.
4. **Given** an invitee with no account opens an invitation link, **When** they finish sign-up, **Then** they land directly on the invitation screen showing the budget name, the inviter's name, and Accept / Decline.
5. **Given** an invitee on the invitation screen, **When** they accept, **Then** they become a member with the role chosen by the inviter, the budget opens, and they are asked for their monthly income for the current budget month, with a Skip option.
6. **Given** an invitee who skipped the income step, **When** they later open the budget, **Then** a non-blocking reminder lets them fill it in.
7. **Given** an invitee, **When** they decline, **Then** they do not join, the invitation can no longer be used, and the owner and Admins see it as declined.
8. **Given** an email invitation for `partner@example.com`, **When** a user signed in as a different email opens it, **Then** they cannot accept it and are told the invitation was sent to another address.
9. **Given** a code invitation, **When** any signed-in user enters the valid code, **Then** they can accept it; once used, the code no longer works for anyone else.
10. **Given** a signed-in user with the app open, **When** they type a 6-character code in "Join a budget", **Then** they reach the same invitation screen as via the link.
11. **Given** an invitee who installed the app from the invite page, **When** they finish sign-up, **Then** the app asks "Got an invitation code?"; entering the code shown on the invite page opens the invitation screen.

---

### User Story 3 - Switch between budgets (Priority: P2)

A user who belongs to several budgets (e.g. household and cattery) switches between them from a budget picker. The app reopens on the last budget they used.

**Why this priority**: Needed as soon as one person has a second budget, but the core two-person household works without it.

**Independent Test**: Belong to two budgets, switch to the second, close and reopen the app, and confirm it opens on the second.

**Acceptance Scenarios**:

1. **Given** a user in two budgets, **When** they open the picker, **Then** they see both budgets with name and their role, and the active one is marked.
2. **Given** a user switches to "Chatterie", **When** they close and reopen the app, **Then** "Chatterie" opens.
3. **Given** the last-used budget was deleted or the user was removed from it, **When** the app opens, **Then** it opens on another budget they belong to, or on the "create or join a budget" screen if they have none.

---

### User Story 4 - Manage pending invitations (Priority: P2)

The owner or an Admin sees every pending invitation (email or code, when sent, expiry) and can resend or revoke each one.

**Why this priority**: Invitations get lost in spam or expire; without this the inviter is stuck.

**Independent Test**: Send two invitations, resend one, revoke the other, and confirm the revoked link no longer works and the resent one has a renewed expiry.

**Acceptance Scenarios**:

1. **Given** an owner or Admin with pending invitations, **When** they open the members screen, **Then** each pending invitation shows its target (email, or "code invitation"), role, date sent and expiry date.
2. **Given** a pending email invitation, **When** the owner or an Admin resends it, **Then** the email (and push, if applicable) is sent again and the expiry is reset to 7 days from now.
3. **Given** a pending invitation, **When** the owner or an Admin revokes it, **Then** opening its link or entering its code shows "This invitation is no longer valid".
4. **Given** an email that already has a pending invitation, **When** the owner or an Admin invites it again, **Then** no duplicate is created; the existing invitation is resent.
5. **Given** an email that belongs to a current member, **When** the owner or an Admin invites it, **Then** the invitation is refused with "This person is already a member".

---

### User Story 5 - Manage members, roles and ownership (Priority: P2)

The owner or an Admin changes another person's role (Admin, Member, Viewer) or removes them; only the owner can transfer ownership. Any non-owner can leave a budget. A removed or departed member's past data stays in history, labelled "former member".

**Why this priority**: Real households change (separation, accountant joins, owner hands over), but day-one usage does not need it.

**Independent Test**: With three people in a budget, make one an Admin and the other a Viewer, have the Admin remove the Viewer, then transfer ownership to the Admin, and confirm roles, permissions and history labels.

**Acceptance Scenarios**:

1. **Given** an owner and a Member, **When** the owner changes the Member to Viewer, **Then** that person can still see everything shared but can no longer create or edit anything.
2. **Given** an owner and a Member, **When** the owner transfers ownership and confirms, **Then** the Member becomes owner and the former owner becomes an Admin; there is still exactly one owner.
3. **Given** an owner, **When** they try to leave, **Then** they are told to transfer ownership or delete the budget first.
4. **Given** a Member, **When** they leave the budget, **Then** they lose access immediately and the remaining members see their past transactions and contributions attributed to their name with a "former member" label.
5. **Given** a removed member, **When** a new budget month starts, **Then** they are not included in that month's members, shares or splits.
6. **Given** a former member, **When** they try to open the budget (old link, cached screen, notification), **Then** access is refused.
7. **Given** an Admin, **When** they invite someone, change a role, remove a Member, Viewer or other Admin, or edit settings, **Then** the action succeeds as it would for the owner.
8. **Given** an Admin, **When** they try to delete the budget, transfer ownership, or change or remove the owner, **Then** the action is refused.

---

### User Story 6 - Budget settings and deletion (Priority: P3)

The owner or an Admin edits the budget name and month start day; only the owner can delete the budget by typing its exact name. All members are notified of the deletion.

**Why this priority**: Rare actions, but deletion is required for GDPR and to unblock an owner who wants to leave.

**Independent Test**: Rename a budget, then delete it by typing its name, and confirm the other member is notified and loses access.

**Acceptance Scenarios**:

1. **Given** an owner or Admin, **When** they rename the budget, **Then** all members see the new name.
2. **Given** an owner or Admin changes the month start day from 1 to 28, **When** they save, **Then** the change applies from the next budget month; the current month keeps its dates.
3. **Given** an owner on the delete screen, **When** the typed name does not match exactly, **Then** the delete button stays disabled.
4. **Given** an owner who typed the exact name, **When** they confirm, **Then** the budget disappears for everyone at once, every other member receives a push notification and email saying who deleted it, and nobody can open it anymore.
5. **Given** a Member or Viewer, **When** they look at budget settings, **Then** they can read them but cannot edit or delete. An Admin can edit but not delete.
6. **Given** a budget deleted less than 30 days ago, **When** its former owner restores it, **Then** it reappears with all its data and the same people and roles, and every member is notified.
7. **Given** a budget deleted 30 days ago or more, **When** anyone looks for it, **Then** it and all its data are permanently erased and cannot be restored.

---

### User Story 7 - Viewer role (Priority: P3)

The owner or an Admin invites someone (an accountant, a parent helping) as a Viewer, who can see everything shared in the budget but change nothing.

**Why this priority**: Explicitly optional in the request; useful but not needed for the couple use case.

**Independent Test**: Invite a Viewer, accept, and confirm every create/edit/delete action is hidden in the app and refused by the server.

**Acceptance Scenarios**:

1. **Given** a Viewer, **When** they open the budget, **Then** they see budget lines, transactions and members, with no edit controls.
2. **Given** a Viewer, **When** they attempt any change by any means, **Then** the server refuses it.
3. **Given** a Viewer accepts an invitation, **When** the invitation completes, **Then** they are not asked for their income (Viewers do not contribute).

---

### Edge Cases

- **Budget at 6 people**: When members plus pending invitations reach 6, new invitations (email or code) are refused with a message explaining the limit.
- **Expired invitation**: Opening an expired link or code shows "This invitation has expired — ask {inviter} for a new one", never a generic error.
- **Code typing**: Codes are case-insensitive and avoid look-alike characters (0/O, 1/I/L); repeated wrong code attempts from one account are temporarily blocked.
- **Already a member via code**: A current member who opens a code invitation for the same budget is told they are already a member; the code is not consumed.
- **Invited email signs up with different email**: They cannot accept the email invitation; the owner or an Admin can send a code invitation instead.
- **Invitation sent, then inviter loses Admin or owner rights or leaves**: Pending invitations stay valid; the invitation screen shows who originally invited.
- **Former member rejoins**: They are re-added as the same person; their old history and new activity are linked, and the "former member" label is removed from the date they rejoin.
- **Owner deletes their account**: Account deletion is never blocked (spec 001 requires it to complete in one flow). When the deletion becomes permanent (after spec 001's 7-day grace period), ownership of each budget they own that has other people transfers automatically to the longest-standing Admin, or else the longest-standing person; the new owner and Admins are notified. A budget where they are the only person is deleted with the account.
- **Member deletes their account**: They lose access as soon as deletion is requested and are removed when it becomes permanent. Unlike a member who leaves, their name is erased with their personal data: past entries are shown as "former member" with no name (spec 001 FR-042).
- **Concurrent conflicting member actions**: If two people with management rights act on the same person at once (e.g. the owner transfers ownership to someone an Admin is removing), only the first action succeeds; the second shows an up-to-date error.
- **Two invitation acceptances at once on a code**: Only the first succeeds; the second sees "already used".
- **Non-member probes**: A non-member requesting any budget data receives the same response whether the budget exists or not.
- **Month start on the 29th–31st**: Not offered; the start day is limited to 1–28 so every month has that day.
- **Long names and 6 members**: Budget names up to 60 characters and member names of any length display without breaking the picker or members list, with 2 to 6 members.

## Requirements *(mandatory)*

### Functional Requirements

**Budgets**

- **FR-001**: Users MUST be able to create a budget with a name (1–60 characters after trimming), a currency (ISO 4217, default EUR) and a month start day (1–28, default 1).
- **FR-002**: The creator MUST become the budget's owner.
- **FR-003**: Every budget MUST have exactly one owner at all times.
- **FR-004**: The system MUST compute each budget month from the month start day (e.g. start day 28 → 28 Oct – 27 Nov).
- **FR-005**: The owner and Admins MUST be able to rename the budget and change the month start day; a start-day change MUST take effect from the next budget month.
- **FR-006**: The currency MUST be changeable only while the budget holds no amounts.
- **FR-007**: A user MUST be able to belong to any number of budgets.

**Invitations**

- **FR-008**: Only the owner and Admins MUST be able to create, resend or revoke invitations, and MUST choose the role granted (Member by default, Admin, or Viewer).
- **FR-009**: An email invitation MUST send an email with a link to the invitation, and, if the email matches an existing account with notifications allowed, a push notification opening the invitation.
- **FR-010**: An email invitation MUST only be acceptable by a signed-in user whose account email matches the invited email (case-insensitive).
- **FR-011**: The owner and Admins MUST be able to generate a code invitation, consisting of a shareable link and a 6-character code, acceptable by any signed-in user who has it.
- **FR-012**: Every invitation MUST expire 7 days after it was last sent and MUST be usable by exactly one person.
- **FR-013**: Inviting an email that belongs to a current member MUST be refused with an explicit error.
- **FR-014**: Inviting an email that already has a pending invitation MUST resend that invitation and reset its expiry, not create a new one.
- **FR-015**: Opening an invitation link without an account MUST lead through sign-up and then directly to the invitation screen, without the user re-opening the link.
- **FR-016**: Opening an invitation link without the app installed MUST lead to a page that directs to the app store and displays the 6-character code (for email invitations too) so the invitee can continue after installing. The app MUST NOT rely on detecting the invitation automatically after install.
- **FR-016a**: Right after sign-up, the app MUST ask the new user whether they have an invitation code, with a Skip option that leads to "Create a budget / Join with a code".
- **FR-017**: The invitation screen MUST show the budget name, the inviter's name, the role offered, and Accept / Decline.
- **FR-018**: Users MUST be able to join by typing a code from a "Join a budget" entry point.
- **FR-019**: Declining MUST invalidate the invitation and show it as declined to the owner and Admins.
- **FR-020**: The owner and Admins MUST be able to list pending invitations with target, role, date sent and expiry, and resend or revoke each.
- **FR-021**: Expired, revoked, declined or used invitations MUST show a specific explanation, not a generic error.
- **FR-022**: The system MUST limit repeated failed code attempts per account to prevent guessing.
- **FR-023**: The number of members plus pending invitations in a budget MUST NOT exceed 6.

**Joining and income**

- **FR-024**: After accepting as Member, the user MUST be asked for their monthly income for the current budget month, with a Skip option.
- **FR-025**: A Member who skipped MUST see a non-blocking reminder to enter their income until they do.
- **FR-025a**: Every member's monthly income MUST be visible to every current person in the budget, Viewers included. A member MUST be told this before entering their income.

**Members and roles**

- **FR-026**: The system MUST support four roles: Owner (everything, including settings, members and deletion), Admin (everything the owner can do except delete the budget, transfer ownership, or change or remove the owner), Member (plan and edit budget lines, record transactions, see everything shared), Viewer (read-only).
- **FR-027**: The owner and Admins MUST be able to change any non-owner's role between Admin, Member and Viewer, including promoting someone to Admin.
- **FR-028**: Only the owner MUST be able to transfer ownership to another current person, after an explicit confirmation; the previous owner MUST become an Admin.
- **FR-029**: The owner and Admins MUST be able to remove any non-owner from the budget after confirmation; an Admin MUST NOT be able to change or remove the owner.
- **FR-030**: Any non-owner MUST be able to leave a budget; the owner MUST NOT be able to leave until they transfer ownership or delete the budget.
- **FR-031**: A removed or departed person MUST lose all access immediately.
- **FR-032**: Past contributions and transactions of a former member MUST remain in history, attributed to their name with a "former member" label.
- **FR-033**: A person who leaves or is removed MUST remain included in the budget month during which they left (their income and share for that month are unchanged) and MUST NOT be included in any budget month starting after their departure.
- **FR-034**: Role changes, removals, departures, ownership transfers and joins MUST be recorded with who did it and when, and visible to the owner and Admins.

**Budget picker**

- **FR-035**: Users MUST be able to switch between their budgets from a picker showing each budget's name and their role.
- **FR-036**: The app MUST reopen on the last budget the user used; if it is no longer available, it MUST open another of their budgets or the "create or join a budget" screen.

**Deletion**

- **FR-037**: Only the owner MUST be able to delete a budget, and only after typing its exact name.
- **FR-038**: Deleting a budget MUST make it inaccessible to everyone immediately and notify every other member by push and email, naming who deleted it.
- **FR-038a**: The owner who deleted a budget MUST be able to restore it, with all its data, people and roles, for 30 days after deletion, from a "Recently deleted" section of the budget picker visible only to them; members MUST be notified of the restore.
- **FR-038b**: 30 days after deletion, the budget and all its data MUST be permanently erased.
- **FR-038c**: Pending invitations of a deleted budget MUST stop working at deletion and MUST NOT be revived by a restore.

**Access control**

- **FR-039**: Every read and write of budget data MUST be refused for anyone who is not a current member of that budget, and every write MUST be refused for Viewers and for actions above the person's role.
- **FR-040**: A refused request by a non-member MUST NOT reveal whether the budget exists.
- **FR-041**: Every endpoint touching budget data MUST have an automated test proving a non-member is refused, and every write endpoint MUST have a test proving a Viewer is refused.

**Notifications and text**

- **FR-042**: All notifications and emails MUST be in French, MUST NOT contain amounts, and MUST NOT show more than the budget name and person names.
- **FR-043**: The members and picker screens MUST be designed for 2 members and remain usable with up to 6.

### Key Entities

- **Budget**: A shared space for one household or activity. Name, currency, month start day, creation date, deletion date (if deleted, for the 30-day restore window). Has exactly one owner and 1–6 people.
- **Membership**: Links a user to a budget with a role (Owner, Admin, Member, Viewer), a join date, and, once ended, a departure date and reason (left, removed, account deleted). Ended memberships stay for history.
- **Invitation**: An offer to join a budget. Type (email or code), target email (email type only), role offered, inviter, 6-character code, link, sent date, expiry, status (pending, accepted, declined, revoked, expired), and who accepted it.
- **Monthly income**: A member's income for one budget month, used later to compute their share. Optional at join time. Visible to everyone in the budget.
- **Membership event**: Audit record of a join, role change, ownership transfer, removal, departure or deletion: who, to whom, when.
- **Last-used budget**: Per user, the budget the app should reopen on.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A partner who receives an invitation and has no account can sign up, accept and land in the shared budget in under 2 minutes, measured in a usability test with at least 5 first-time participants (median time).
- **SC-002**: 100% of endpoints that touch budget data have passing automated tests proving that a non-member is refused, and 100% of write endpoints have passing tests proving a Viewer is refused.
- **SC-003**: No request by a non-member returns any budget data, verified by the authorization test suite on every release.
- **SC-004**: A user can create their first budget in under 30 seconds.
- **SC-005**: Switching between two budgets takes at most 2 taps and the selected budget is shown in under 1 second.
- **SC-006**: At least 90% of invited partners who open an invitation link complete joining on the first attempt without contacting the inviter.
- **SC-007**: Members, invitations and picker screens show no truncated, overlapping or hidden controls with 6 members at the largest system font size.

## Assumptions

- User accounts (sign-up, sign-in, push permission) come from feature 001-user-accounts; this feature depends on it.
- Admins contribute income and are counted in shares like Members; Viewers are not. Members cannot invite.
- Email invitations also expire after 7 days (the request only states it for code invitations), renewed on resend.
- The Viewer role is in scope, as the lowest-priority story (P3).
- Viewers are not asked for income and are not counted in share computations.
- How income becomes "my share" is defined by a later budgeting feature; this feature only captures the monthly income figure (in exact minor units, per the constitution).
- If an owner deletes their account, any of their budgets still in the 30-day restore window are erased immediately.
- Month start days 29–31 are not offered, to avoid months that lack that day.
- The last-used budget is remembered per account, so it carries across devices.
- A user with no budgets sees a "Create a budget / Join with a code" screen after sign-in.
