# Two Cents Constitution

Two Cents is a mobile app that lets a household (usually a couple) plan its monthly
budget together, track actual spending against it, and see where the month stands at a glance.
Principles are listed in priority order: when two principles conflict, the lower number wins.

## Core Principles

### I. Money Is Always Exact (NON-NEGOTIABLE)

- Amounts MUST be stored and computed as integer minor units (cents) with an explicit ISO 4217
  currency. The default currency is EUR.
- Floating-point arithmetic on money is forbidden everywhere: database columns, API payloads,
  domain code and the app.
- Every rounding rule (e.g. an annual amount prorated monthly) MUST be written down in the
  domain code, deterministic, and covered by unit tests, including the remainder cents.
- Amount input MUST accept both `12,5` and `12.5`, MUST reject anything that does not parse
  to a valid amount, and MUST NEVER store raw text in place of a number.
- Changes to financial records MUST be traceable (who changed what, and when).

**Rationale**: A household only uses a budget app it trusts. A one-cent drift destroys trust.

### II. Calculations Are Tested First

- Every derived figure (totals, what's left per member, transfer to the joint account,
  planned vs actual, envelope progress) MUST live in pure domain functions shared by the
  backend and the app.
- Unit tests for a domain function MUST be written and seen failing before the implementation.
- The backend is the source of truth. The app MAY compute figures optimistically, but its
  results MUST match the backend's for the same inputs, using the same shared functions.
- A calculation bug fix MUST include a regression test reproducing it.

**Rationale**: Calculation errors are silent. Tests are the only thing that catches them
before a household does.

### III. Privacy by Default

- Financial data is personal data under GDPR. Data MUST be visible only to members of the
  budget it belongs to, enforced server-side on every read and write, with a test proving
  a non-member is refused.
- Users MUST be able to export all their data and delete their account from inside the app.
- Bank credentials MUST NEVER be stored.
- Secrets and tokens on the device MUST live in secure storage (Keychain / Keystore via
  `expo-secure-store`), never in plain storage. Server secrets come from environment variables
  and MUST NOT be committed.
- Logs, analytics events and error reports MUST NOT contain amounts, labels, or personal data.

**Rationale**: Two people's money in one place is sensitive; a leak is the worst failure.

### IV. Mobile-First & Native-Feeling

- The phone is the primary device. Screens MUST use platform navigation patterns (native
  tabs, stacks, sheets).
- Every screen MUST respect safe areas, support Dynamic Type / font scaling, support dark
  mode, and use haptics for meaningful confirmations.
- Recording a transaction MUST take under 10 seconds from opening the app; any feature that
  touches this flow MUST state how it keeps the budget.

**Rationale**: If logging an expense is slower than forgetting it, actuals stop being tracked.

### V. One Design System

- All UI MUST be built from a small set of shared design tokens (color, spacing, typography,
  radius) and shared components.
- Screens MUST NOT contain one-off colors, spacings or font sizes.
- Amounts MUST always be rendered by a single amount component with locale formatting
  (fr-FR: `1 436,42 €`) and tabular figures.

**Rationale**: Consistency makes numbers easy to compare and the app fast to build.

### VI. French First, i18n-Ready

- The UI ships in French. Every user-facing string MUST go through the translation layer;
  hard-coded UI strings are forbidden, so English can be added without code changes.
- Dates, numbers and currency MUST be formatted with the user's locale.

**Rationale**: The first users are French; the second language must not need a rewrite.

### VII. Contract-First API

- Request and response schemas MUST be defined once, in a shared package, and consumed by
  both the backend and the app. Neither side may hand-copy a payload shape.
- Every request MUST be validated against its schema at the API boundary and rejected with
  a 4xx on invalid input.
- TypeScript MUST run in strict mode in every package; `any` requires an inline justification.
- Breaking API changes MUST be versioned, and older app versions in the field MUST keep
  working until the plan documents their retirement.

**Rationale**: The app and backend share one data model; a single contract keeps them in sync.

### VIII. Accessible

- Every interactive element MUST have an accessibility label and a touch target of at least
  44×44 pt.
- Text and UI contrast MUST meet WCAG 2.2 AA (4.5:1 for text, 3:1 for large text and UI parts).
- Meaning MUST NEVER be carried by color alone (e.g. over-budget also shows an icon or label).

**Rationale**: Both members of a household must be able to use the app, whatever their needs.

### IX. AI Is Optional & Explainable

- Any AI feature MUST be opt-in per budget and off by default.
- Before changing data, an AI feature MUST show what it is going to do, and MUST NEVER write
  to the budget without explicit user confirmation.
- Only the minimum data needed for the task may be sent to a model provider; the plan MUST
  list exactly which fields are sent.

**Rationale**: Users stay in control of their money; AI assists, it does not decide.

### X. Simplicity Over Cleverness

- Build the smallest thing that fully serves the user story. No premature abstraction.
- Feature flags MUST have a removal date; no feature stays behind a flag indefinitely.
- Every feature MUST be usable by two non-technical people managing a household.
- New dependencies or abstraction layers MUST be justified in the plan.

**Rationale**: A simple app ships sooner and stays understandable for its users and its code.

## Technology & Architecture Constraints

- **Mobile**: React Native via Expo (managed workflow) + Expo Router + TypeScript, in
  `mobile/`. Native capabilities MUST come from Expo SDK modules first; leaving the managed
  workflow requires a constitution amendment. Mobile builds go through EAS.
- **Backend**: NestJS 12 + TypeScript, in `backend/`, tested with Jest (unit) and Supertest
  (e2e).
- **Shared code**: domain functions (Principle II) and API schemas (Principle VII) MUST live in
  shared TypeScript package(s) consumed by both `backend/` and `mobile/`. The first plan that
  needs them decides the location.
- **Package manager**: pnpm with committed lockfiles; CI and Docker installs MUST use
  `--frozen-lockfile`.
- **Runtime**: Node.js 24.9+ (pinned in `.node-version`, `engines` and the Dockerfile). The
  backend production image MUST NOT contain dev dependencies.
- Changing a core stack component (framework, database, package manager) requires a
  constitution amendment.

## Development Workflow & Quality Gates

- Commits MUST follow Conventional Commits with a scope and issue reference,
  e.g. `feat(mobile): add quick expense sheet [#12]`.
- Feature work follows Spec Kit: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-implement`. Every plan MUST include a Constitution Check against Principles I–X.
- Before merge to `main`, each touched package MUST pass lint, a typecheck, and its test
  suites (including `pnpm test:e2e` for the backend).
- UI changes MUST be checked in light and dark mode, at the largest font scale, and with a
  screen reader on at least one platform before merge.
- Formatting is settled by the repo's Prettier/ESLint configs.

## Governance

- This constitution overrides feature specs, plans and other practices. When they conflict,
  the constitution wins and the spec or plan MUST be changed.
- Amendments are made via `/speckit-constitution`. Each amendment MUST state a short
  rationale and bump the version.
- Versioning follows semantic versioning:
  - MAJOR: principle removed, redefined, or reordered in a way that changes priority.
  - MINOR: new principle or section, or materially expanded guidance.
  - PATCH: clarifications and wording fixes.
- Compliance: every plan's Constitution Check and every review MUST verify Principles I–X.
  Any deviation MUST be listed with justification in the plan's Complexity Tracking section.

**Version**: 2.0.0 | **Ratified**: 2026-11-16 | **Last Amended**: 2026-11-16
