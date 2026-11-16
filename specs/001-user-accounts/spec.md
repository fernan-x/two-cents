# Feature Specification: User Accounts

**Feature Branch**: `001-user-accounts` (spec directory; no git branch created by this command)

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "Users need a personal account to use the app. Each person in a household has their own account; budgets are shared between accounts (covered in a separate feature). Sign up with email + password, Sign in with Apple / Google; email confirmation before sharing; multi-device sessions with silent refresh; password reset by single-use 1-hour link; biometric unlock with optional lock on every open; profile (first name, avatar/color, language, currency); active sessions and log out other devices; data export (JSON + CSV) and in-app account deletion. Rules: case-insensitive unique emails, 10+ character passwords checked against breached lists, rate-limited login with temporary lockout, provider linking only after proof of ownership, Apple relay emails work for invitations, users without a budget are guided to create one or enter an invitation code. Out of scope: 2FA beyond biometrics, organisation/SSO login. Success: install to empty budget under 60 s; no plain-text passwords or tokens; account deletion in one flow with no support request."

## Clarifications

### Session 2026-11-16

- Q: When a user exports their data, should the export include entries that other household members created in shared budgets? → A: Yes — include every entry in each budget the user belongs to, with each entry's author shown by first name.
- Q: When a user confirms account deletion, should the account be deleted right away, or after a waiting period during which they can cancel? → A: 7-day grace period. The account is locked and hidden from the household immediately; the user can cancel by signing in or via an email link; data is permanently deleted on day 7.
- Q: Should a session on a device that hasn't been used for a long time expire on its own? → A: Yes, after 90 consecutive days without use; any use resets the 90 days.
- Q: When someone tries to sign up with an email that already has an account, should the app say so on screen? → A: Yes. Show "this email is already in use", offer login or password reset, and rate-limit sign-up attempts. (Hiding it was considered and rejected because it would require email confirmation before first use, which breaks the 60-second goal.)
- Q: When Face ID or the fingerprint fails, should the phone's own passcode be accepted to unlock Two Cents? → A: No. The only fallbacks are the Two Cents account password or re-authenticating with Apple/Google.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an account and reach an empty budget (Priority: P1)

A new user installs the app and creates an account with email + password, Sign in with Apple, or Sign in with Google. Because they have no budget yet, the app guides them to either create a budget or enter an invitation code. Creating a budget lands them on an empty budget.

**Why this priority**: Nothing else in the app works without an account. This is the MVP slice and carries the "install to empty budget in under 60 seconds" goal.

**Independent Test**: On a fresh install, create an account with each of the three methods and reach an empty budget; time the email + password path.

**Acceptance Scenarios**:

1. **Given** a fresh install, **When** the user signs up with a valid email, a first name and a valid password, **Then** an account is created, they are signed in, and they see the "create a budget / enter an invitation code" choice.
2. **Given** a fresh install, **When** the user signs in with Apple or Google for the first time, **Then** an account is created with the provider's email (including an Apple "hide my email" relay address), they are signed in, and they see the same choice.
3. **Given** the user signs up with `Maelle@Example.com` and an account already exists for `maelle@example.com`, **When** they submit, **Then** sign-up is refused and they are offered to log in or reset their password.
4. **Given** the user enters a password shorter than 10 characters, or one found on a common/breached password list, **When** they submit, **Then** sign-up is refused with a message explaining why, and nothing is created.
5. **Given** a signed-in user with no budget, **When** they choose "create a budget", **Then** they land on an empty budget.
6. **Given** a signed-in user with no budget, **When** they choose "enter an invitation code" and their email is not yet confirmed, **Then** they are asked to confirm their email first.

---

### User Story 2 - Log in, stay logged in across devices, log out (Priority: P1)

A user logs in on their phone and their tablet. Each device stays signed in until the user logs out, without being asked for the password again while they keep using it.

**Why this priority**: Returning users must get back into the app; without login, P1 is a one-shot.

**Independent Test**: Log in on two devices, use both over several days, confirm neither asks for the password; log out on one and confirm the other is unaffected.

**Acceptance Scenarios**:

1. **Given** an existing account, **When** the user logs in with the correct email (any letter case) and password, **Then** they are signed in on that device.
2. **Given** the user is signed in on a phone and a tablet, **When** they keep using both, **Then** neither device asks them to sign in again while the session is valid.
3. **Given** a signed-in device, **When** the user logs out, **Then** that device's session ends and other devices stay signed in.
4. **Given** repeated wrong passwords for one account, **When** the failure threshold is reached, **Then** further login attempts for that account are temporarily refused, and the user is told when they can retry and offered a password reset.
5. **Given** a wrong email or a wrong password, **When** login fails, **Then** the message does not reveal which of the two was wrong.
6. **Given** a device whose session has not been used for 90 consecutive days, **When** the app is opened, **Then** the session has expired and the user must sign in again; a device used at least once in every 90-day window never asks.

---

### User Story 3 - Confirm email address (Priority: P2)

A user who signed up by email receives a confirmation link. Until they confirm, they can use their own budget but cannot invite anyone or join a shared budget.

**Why this priority**: Required before sharing (a separate feature) can work safely, but not needed to start using the app alone.

**Independent Test**: Sign up by email, check that invite/join actions are blocked, click the link, check that they are unblocked.

**Acceptance Scenarios**:

1. **Given** a user just signed up by email, **When** sign-up completes, **Then** a confirmation email is sent and the app shows that the email is unconfirmed, with a "resend" action.
2. **Given** an unconfirmed user, **When** they try to invite someone or enter an invitation code, **Then** the action is blocked and they are prompted to confirm their email.
3. **Given** a confirmation link, **When** the user opens it within its validity period, **Then** the email is marked confirmed and sharing actions become available.
4. **Given** an expired or already-used confirmation link, **When** the user opens it, **Then** they see that it is no longer valid and can request a new one.
5. **Given** a user who signed up with Apple or Google, **When** the account is created, **Then** their email is treated as confirmed.

---

### User Story 4 - Reset a forgotten password (Priority: P2)

A user who forgot their password requests a reset link by email, opens it, and sets a new password.

**Why this priority**: Without it, a forgotten password means a lost account and a support request.

**Independent Test**: Request a reset, use the link once, try it again, try an expired one.

**Acceptance Scenarios**:

1. **Given** the login screen, **When** the user requests a reset for any email, **Then** the app shows the same confirmation message whether or not an account exists for that email.
2. **Given** a reset link less than 1 hour old and never used, **When** the user sets a valid new password, **Then** the password is changed, the link becomes unusable, and all existing sessions on other devices are ended.
3. **Given** a reset link older than 1 hour, or already used, **When** the user opens it, **Then** it is refused and they can request a new one.
4. **Given** several reset requests, **When** a newer link is issued, **Then** older unused links stop working.

---

### User Story 5 - Unlock with Face ID / fingerprint (Priority: P2)

A user turns on biometric unlock so they can get into the app with Face ID or a fingerprint. On a shared family phone they can also require biometrics every time the app opens, so others cannot see the budget.

**Why this priority**: Protects financial data on shared phones and keeps "open app → record expense" fast.

**Independent Test**: Enable the lock on a device with biometrics, background the app past the grace period, reopen, and confirm the budget stays hidden until biometric success.

**Acceptance Scenarios**:

1. **Given** a device with enrolled biometrics, **When** the user enables biometric unlock, **Then** they confirm with a biometric check and the setting is saved for this device only.
2. **Given** "require on every open" is on, **When** the app is cold-started or returns from the background after more than 30 seconds, **Then** no budget data is visible until a successful biometric check.
3. **Given** biometrics fail or are cancelled, **When** the user chooses the fallback, **Then** they can unlock by entering their account password (or, for Apple/Google accounts, by signing in again with their provider); the phone's own passcode is not offered.
4. **Given** the device's biometric enrolment changes (e.g. a new fingerprint is added), **When** the app next needs to unlock, **Then** biometric unlock is disabled and the user must use the fallback, then may re-enable it.
5. **Given** the app is in the app switcher while locked, **When** the switcher preview is shown, **Then** no financial data is visible in it.

---

### User Story 6 - Edit my profile (Priority: P3)

A user sets their first name (shown to their household), an avatar/color, their preferred language and their preferred currency.

**Why this priority**: Needed for a pleasant shared experience, but sensible defaults let the app work without it.

**Independent Test**: Change each field and confirm it persists across devices and app restarts.

**Acceptance Scenarios**:

1. **Given** the profile screen, **When** the user changes their first name to "Maëlle", **Then** the new name (with accents preserved) is saved and shown wherever household members see them.
2. **Given** the profile screen, **When** the user picks an avatar and a color from the provided set, **Then** they are saved and shown next to their name.
3. **Given** the profile screen, **When** the user changes their language, **Then** the app's text switches to that language without reinstalling.
4. **Given** the profile screen, **When** the user changes their preferred currency, **Then** it becomes the default currency proposed for new budgets they create; existing budgets are unchanged.
5. **Given** an empty or whitespace-only first name, **When** they save, **Then** it is refused.

---

### User Story 7 - Manage active sessions (Priority: P3)

A user sees the list of devices where they are signed in and can log out of all other devices at once (e.g. after losing a tablet).

**Why this priority**: Security hygiene; rarely used but important when needed.

**Independent Test**: Sign in on three devices, open the list on one, log out all others, confirm the two others are signed out on their next action.

**Acceptance Scenarios**:

1. **Given** a user signed in on several devices, **When** they open "active sessions", **Then** they see each session with its device name/type, sign-in date, last activity date, and which one is the current device.
2. **Given** the session list, **When** the user chooses "log out of all other devices", **Then** every session except the current one ends, and those devices return to the sign-in screen at their next request.
3. **Given** the session list, **When** the user ends one specific other session, **Then** only that session ends.

---

### User Story 8 - Export my data and delete my account (Priority: P3)

A user downloads all their data (JSON and CSV) and can permanently delete their account from inside the app, in a single flow, without contacting support.

**Why this priority**: Legal requirement (GDPR) and a constitution principle; not needed to start using the app but must ship before public release.

**Independent Test**: Export data and check the files; delete an account that is the sole member of one budget and a co-member of another, then check both budgets.

**Acceptance Scenarios**:

1. **Given** the account screen, **When** the user requests an export, **Then** they receive a JSON file and CSV files containing all their data (see FR-040), which they can save or share from the device.
2. **Given** the user starts account deletion, **When** they confirm by re-authenticating (password, or Apple/Google sign-in) and an explicit "delete" confirmation, **Then** in that same flow the account becomes "pending deletion": all its sessions end, the household sees them as "former member", they receive an email with a cancel link and the permanent deletion date (7 days later), and they are returned to the welcome screen.
3. **Given** an account pending deletion, **When** the user signs in or opens the cancel link within 7 days and confirms cancellation, **Then** the account, its budget memberships and its display name are fully restored.
4. **Given** the user is the only member of a budget, **When** the 7-day period ends, **Then** that budget and all its data are permanently deleted.
5. **Given** the user shares a budget with others, **When** the 7-day period ends, **Then** they are removed from it, the budget continues for the remaining members, and the entries they created stay but are shown as created by "former member".
6. **Given** a permanently deleted account, **When** anyone tries to sign in with its credentials or sessions, **Then** access is refused, and the email address can be used to create a new account.
7. **Given** the deletion screen, **When** it is shown, **Then** it lists the consequences (which budgets will be deleted, which will be left, the 7-day cancellation window) and offers to export data first.

---

### Edge Cases

- **Provider sign-in with an email that already has a password account**: no account is created and nothing is linked until the user proves ownership, either by entering that account's password or by clicking a confirmation link sent to that email. After linking, both methods sign into the same account.
- **Provider sign-in with an email already linked to another provider** (e.g. Google, then Apple with the same email): same rule as above — ownership must be proven before linking.
- **Password sign-up with an email that already has an Apple/Google-only account**: sign-up is refused; the user is told to sign in with that provider (or use password reset to add a password).
- **Apple "hide my email" relay**: emails (confirmation, reset, invitations) sent to the relay address must reach the user; email invitations can only be accepted by the account whose email matches (spec 002 FR-010), so a relay-address user joins with the 6-character code, which every invitation page shows (spec 002 FR-016).
- **Apple/Google withholds or later changes the email**: the account is identified by the provider's stable user identifier, not by email; the stored email is updated if the provider reports a new one.
- **Account revoked at Apple/Google** (user removes the app from their Apple ID): the corresponding sign-in method stops working; sessions tied to it are ended.
- **Email letter case and surrounding spaces**: `  Fabien@Example.COM ` and `fabien@example.com` are the same account.
- **Lockout used against a victim**: lockout is temporary and a successful password reset lifts it, so an attacker cannot lock someone out indefinitely.
- **Device offline**: a signed-in user can open the app and see cached data (subject to the biometric lock); sign-up, login, reset and deletion require a connection and say so clearly.
- **Session expired or revoked while the app is open**: the next request returns the user to the sign-in screen without losing unsent input where practical, and with an explanation.
- **Device without biometrics** (or biometrics not enrolled): the biometric options are hidden or disabled with an explanation.
- **Deleting an account while the last member of a budget that has pending invitations**: the budget is deleted and its pending invitations are cancelled.
- **Invitations the deleted user sent that are still pending**: they are cancelled when deletion is requested, and are not restored if deletion is cancelled.
- **Sign-up with an email whose account is pending deletion**: refused; the user is offered to sign in and cancel the deletion instead.
- **Another member edits a shared budget during the 7-day period**: allowed; the pending-deletion user's past entries stay unchanged and appear as "former member" until the deletion is cancelled or becomes permanent.
- **Password change while signed in elsewhere**: other sessions are ended (same as reset).
- **Reset requested for a provider-only account**: the reset email lets the user set a password, which adds email + password as a sign-in method.

## Requirements *(mandatory)*

### Functional Requirements

**Sign-up & sign-in**

- **FR-001**: Users MUST be able to create an account with an email address, a first name and a password.
- **FR-002**: Users MUST be able to create an account or sign in with Sign in with Apple and with Sign in with Google.
- **FR-003**: Email addresses MUST be unique across accounts and compared case-insensitively after trimming surrounding whitespace.
- **FR-004**: Passwords MUST be at least 10 characters and MUST be rejected if they appear on a list of common or known-breached passwords; the check MUST NOT send the password to any third party in a recoverable form.
- **FR-005**: Failed logins MUST be rate-limited per account and per origin; after 5 consecutive failures on one account, password login for that account MUST be refused for 15 minutes. A successful password reset MUST lift the lockout.
- **FR-006**: Login and password-reset responses MUST NOT reveal whether an email address has an account.
- **FR-006a**: Sign-up MAY reveal that an email is already in use (offering login or password reset), and sign-up attempts MUST be rate-limited per origin so it cannot be used to check emails in bulk.
- **FR-007**: The system MUST link an Apple/Google identity to an existing account with the same email only after the user proves ownership of that account (correct password, or a confirmation link sent to that email).
- **FR-008**: Accounts created through Apple/Google MUST be identified by the provider's stable user identifier, and MUST work with Apple "hide my email" relay addresses.

**Email confirmation**

- **FR-010**: After email sign-up, the system MUST send a confirmation link valid for 24 hours and single-use; users MUST be able to request a new one (rate-limited).
- **FR-011**: Users with an unconfirmed email MUST NOT be able to send invitations to a shared budget or accept one; all other features MUST remain usable.
- **FR-012**: Emails received from Apple or Google sign-in MUST be treated as confirmed.

**Sessions**

- **FR-020**: A user MUST be able to be signed in on several devices at once, each with its own session.
- **FR-021**: Sessions MUST renew silently while the app is used; a session MUST stay valid until the user logs out, it is revoked, the password is changed or reset, the account is deleted, or it is unused for 90 consecutive days.
- **FR-022**: Users MUST be able to list their active sessions (device name/type, sign-in date, last activity, current-device marker).
- **FR-023**: Users MUST be able to end one specific other session and to end all sessions except the current one.
- **FR-024**: Logging out MUST end the session on the server, not only on the device.

**Password reset**

- **FR-030**: Users MUST be able to request a password-reset link by email.
- **FR-031**: Reset links MUST expire 1 hour after issue, MUST be usable once, and MUST be invalidated when a newer link is issued.
- **FR-032**: A successful password reset or change MUST end all other sessions of the account.

**Biometric lock**

- **FR-035**: Users MUST be able to enable unlocking the app with the device's biometrics (Face ID, Touch ID, fingerprint, face unlock), per device.
- **FR-036**: Users MUST be able to require biometric unlock every time the app opens; when enabled, no budget data may be shown on cold start or after more than 30 seconds in the background until unlock succeeds, including in the app-switcher preview.
- **FR-037**: When biometrics fail, are cancelled, or are unavailable, users MUST be able to unlock with their account password or by re-authenticating with their provider. The device passcode MUST NOT be accepted as a fallback, because other people sharing the phone may know it.
- **FR-038**: Biometric unlock MUST be disabled automatically when the device's biometric enrolment changes.

**Profile**

- **FR-039**: Users MUST be able to edit their first name (1–50 characters, any script, accents preserved), avatar and color (from a provided set), preferred language (French, English) and preferred currency (ISO 4217, default EUR). The first name, avatar and color are visible to members of budgets the user belongs to.

**Export & deletion**

- **FR-040**: Users MUST be able to export, from inside the app, all their data as one JSON file and as CSV files: their profile, their sign-in methods (without secrets), their active sessions, and every budget they belong to with all its entries, including those created by other members, each entry labelled with its author's first name (or "former member").
- **FR-041**: Users MUST be able to request deletion of their account from inside the app in a single flow that requires re-authentication and an explicit confirmation, and that lists consequences and offers an export first.
- **FR-041a**: On confirmation, the account MUST enter a 7-day "pending deletion" state: all sessions end; pending invitations it sent are cancelled; it cannot invite, be invited or use any budget; household members see it as "former member"; and an email is sent with a cancel link and the permanent deletion date. The email address stays reserved during this period.
- **FR-041b**: During the 7 days, the user MUST be able to cancel deletion by signing in or via the email link; cancelling restores the account, its memberships and its display name exactly as before.
- **FR-042**: When the 7 days end, the system MUST permanently: remove the user from every shared budget; delete budgets where they are the only member, with their data; keep entries they created in shared budgets and show their author as "former member"; and delete their personal data (email, name, avatar, sign-in methods, sessions).
- **FR-043**: After permanent deletion, the email address MUST be free to create a new account, which MUST NOT regain access to the deleted account's data.

**Onboarding**

- **FR-045**: A signed-in user with no budget MUST be guided to either create a budget or enter an invitation code, and MUST NOT see an empty or broken main screen.

**Security & privacy**

- **FR-050**: Passwords MUST never be stored or logged in plain text; only a one-way, salted, slow hash may be stored.
- **FR-051**: Session tokens, reset links and confirmation links MUST never be stored in plain text on the server, and session secrets on the device MUST be kept in the platform's secure storage.
- **FR-052**: Security events (sign-up, login success/failure, lockout, reset, session revoked, account linked, account deleted) MUST be recorded for audit without passwords, tokens, or financial data.
- **FR-053**: All user-facing text in these flows (including emails) MUST be available in French and English and shown in the user's preferred language.

### Key Entities

- **User**: one person. First name, avatar, color, preferred language, preferred currency, email, email-confirmed flag, created date, status (active, pending deletion with scheduled deletion date). Belongs to zero or more budgets (budget membership is defined in the shared-budget feature).
- **Sign-in method**: a way to authenticate a user — email + password (password stored only as a hash), Apple identity, or Google identity (provider's stable user ID + email reported by the provider). A user has one or more.
- **Session**: one signed-in device for one user. Device name/type, sign-in date, last activity, status (active, revoked, expired).
- **Single-use link**: an email confirmation or password-reset link. Purpose, owner, issue date, expiry, used flag.
- **Biometric lock setting**: per device, not synced. Enabled flag, "require on every open" flag.
- **Former member**: the placeholder author shown on shared entries whose creator deleted their account; holds no personal data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user goes from opening the freshly installed app to seeing an empty budget in under 60 seconds with any of the three sign-up methods (measured with a test user, excluding store download time and email confirmation).
- **SC-002**: An audit of stored data, logs and device storage finds zero passwords, session tokens, reset links or confirmation links in plain text.
- **SC-003**: 100% of account deletions complete inside the app in one flow, with zero support requests needed to delete an account.
- **SC-004**: A returning user with biometric unlock gets from tapping the app icon to their budget in under 3 seconds.
- **SC-005**: A user signed in on two devices is not asked to sign in again during 30 days of regular use.
- **SC-006**: After "log out of all other devices", every other device loses access at its next request.
- **SC-007**: 90% of test users complete a password reset on their first attempt without help.
- **SC-008**: A data export for a typical household (two years of entries) is ready on the device in under 30 seconds.

## Assumptions

- Shared budgets, invitations and invitation codes are defined in a separate feature; this spec only defines who may invite/join (confirmed email) and the onboarding choice.
- Apple relay-address users join shared budgets with the invitation code, since email invitations require a matching account email (spec 002 FR-010, FR-016).
- Sign in with Apple is offered on iOS only in this version. An Apple-created account used on Android signs in with email + password, set through password reset.
- Users with an unconfirmed email can still create and use their own budget, so confirmation never blocks the 60-second goal.
- Avatar = a choice from a provided set of avatars/initials on a color from a provided palette; uploading a photo is out of scope for this feature.
- Changing the account email, unlinking a sign-in method, and changing the password from settings (other than via reset) are out of scope for this version.
- Account deletion becomes permanent 7 days after confirmation (see Clarifications); backups age out under the normal retention policy.
- Including other members' entries in the export reveals nothing new, since the user can already see them in the app (see Clarifications).
- Supported languages at launch: French (default) and English. Default currency: EUR.
- Out of scope: two-factor authentication beyond biometrics, organisation/SSO login.
