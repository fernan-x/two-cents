# Two Cents Constitution

## Core Principles

### I. Financial Data Integrity (NON-NEGOTIABLE)

- Monetary amounts MUST be stored and computed as integers in minor units (e.g. cents),
  never as floating-point numbers.
- Every amount MUST carry an explicit currency (ISO 4217 code); arithmetic across different
  currencies without an explicit conversion step is forbidden.
- Split results MUST sum exactly to the original amount; rounding remainders MUST be assigned
  by a documented, deterministic rule.
- Expenses and budget changes MUST be traceable: who created/changed them and when.
  Hard deletes of financial records require an explicit justification in the spec.

**Rationale**: A couples budget app is only useful if both partners trust the numbers.
A one-cent drift destroys that trust.

### II. Privacy & Shared-Space Isolation

- All data MUST be scoped to a shared space; every read and write MUST be authorized
  server-side against the requesting user's membership in that space.
- Personal budgets and personal expenses MUST be visible only to their owner unless the owner
  explicitly shares them.
- Each endpoint that exposes space data MUST have a test proving a non-member (and, for
  personal data, the partner) cannot access it.
- Secrets and credentials MUST NOT be committed; configuration comes from environment variables.

**Rationale**: Financial data is sensitive and the app holds two people's money in one place.
Isolation failures are the most damaging bug class here.

### III. Test-First Domain Logic

- Domain logic (splitting, budget totals, remaining balances, period boundaries) MUST have unit
  tests written before or alongside the implementation, and they MUST fail before the fix lands.
- Each backend endpoint MUST have at least one e2e test (`pnpm test:e2e`) covering the success
  path and the authorization failure path.
- A bug fix MUST include a regression test reproducing the bug.

**Rationale**: Calculation errors are silent; only tests catch them before a user does.

### IV. Typed Contracts End-to-End

- TypeScript MUST run in strict mode in both `backend/` and `mobile/`; `any` requires an
  inline justification comment.
- Every API request body and query MUST be validated at the boundary (NestJS DTO validation)
  and rejected with a 4xx on invalid input.
- API contracts MUST be defined in one place and consumed by the mobile app as types; the
  mobile app MUST NOT hand-copy response shapes.
- Breaking API contract changes MUST be called out in the feature plan.

**Rationale**: Two codebases share one data model; typed contracts keep them from drifting.

### V. MVP-First Simplicity

- Work MUST map to a goal in the README roadmap or an approved spec; features outside it are
  deferred, not built speculatively.
- Prefer the framework's defaults (NestJS modules, Expo SDK modules, Expo Router) over
  custom abstractions. New dependencies or abstraction layers MUST be justified in the plan.
- YAGNI: no configuration, extension points, or generality without a current use case.

**Rationale**: The project is pre-MVP. Shipping a working shared budget beats a flexible one.

## Technology & Architecture Constraints

- **Backend**: NestJS 11 + TypeScript, located in `backend/`, tested with Jest (unit) and
  Supertest (e2e).
- **Mobile**: React Native via Expo (managed workflow) + Expo Router + TypeScript, located in
  `mobile/`. Native capabilities MUST come from Expo SDK modules first; ejecting to a bare
  workflow requires a constitution amendment.
- **Package manager**: pnpm, with committed lockfiles; installs MUST use `--frozen-lockfile`
  in CI and Docker builds.
- **Runtime**: Node.js LTS; the backend production image is built from the multi-stage
  `dockerfile` and MUST NOT contain dev dependencies. Mobile builds go through EAS.
- Changing a core stack component (framework, database, package manager) requires a
  constitution amendment.

## Development Workflow & Quality Gates

- Commits MUST follow Conventional Commits with a scope and issue reference,
  e.g. `feat(backend): add expense split endpoint [#12]`.
- Feature work follows Spec Kit: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-implement`. The plan MUST include a Constitution Check against Principles I–V.
- Before merge to `main`, each touched app MUST pass: `pnpm lint`, a typecheck
  (`pnpm build` for the backend, `tsc --noEmit` for mobile), and its test suites
  (`pnpm test`, plus `pnpm test:e2e` for the backend).
- Code is formatted with Prettier/ESLint configs in the repo; formatting debates are settled
  by the tooling.

## Governance

- This constitution supersedes other practices. When guidance conflicts, the constitution wins.
- Amendments are made via `/speckit-constitution`, recorded in the Sync Impact Report, and
  committed with a `docs: amend constitution to vX.Y.Z` message.
- Versioning follows semantic versioning:
  - MAJOR: principle removed or redefined in a backward-incompatible way.
  - MINOR: new principle or section, or materially expanded guidance.
  - PATCH: clarifications and wording fixes.
- Compliance: every plan's Constitution Check and every review MUST verify Principles I–V.
  Any deviation MUST be listed with justification in the plan's Complexity Tracking section.

**Version**: 1.1.0 | **Ratified**: 2026-11-16 | **Last Amended**: 2026-11-16
