# Quickstart: Transaction Tracking

Validation guide for feature 004. Contracts: [contracts/rest-api.md](contracts/rest-api.md).
Data: [data-model.md](data-model.md). Decisions: [research.md](research.md).

## Prerequisites

- Features 001–003 running locally (see the 003 quickstart): `docker compose up -d`,
  `pnpm install --frozen-lockfile`, backend migrated (`0007_transactions.sql` applied).
- Two test accounts in one budget: **Maëlle** (owner) and **Fabien** (member), plus a Viewer.
- A month **Novembre 2026** (Active) with at least: "Courses" (Recurring shared, envelope,
  400 €, split Maëlle 100 € / Fabien 300 €), "Carburant" (envelope, 200 €), "Animalerie"
  (envelope, 120 €, sub-items croquettes/litière), "Loyer" (Recurring shared, 950 €).
  Maëlle has a meal-voucher income line of 160 €.
- Development builds on two devices or simulators (iOS + Android), one per account.

## Automated checks

```bash
pnpm --filter @two-cents/shared test        # tracking/, csv/ domain incl. property tests (SC-005)
pnpm --filter two-cents-backend test         # use cases with in-memory fakes
pnpm --filter two-cents-backend test:e2e     # API, authz matrix, privacy leak, idempotency, concurrency, recurring job
pnpm --filter mobile test                    # keypad, quick add, offline queue, envelope card, CSV review
pnpm lint && pnpm typecheck
```

Expected: all green; the property test runs ≥ 1 000 generated months with 0–300 transactions.

## Manual scenarios

| # | Story | Steps | Expected |
|---|---|---|---|
| 1 | US1 quick add | As Fabien, from the month list tap "+", type `42,30`, "Leclerc", tap "Courses", save. Time it. | Sheet closes with haptic; row appears today, payer Fabien, planned; Courses actual +42,30 €; under 10 s |
| 2 | US1 validation | Type `12,555`, then `abc` | Save disabled, inline error |
| 3 | US2 envelopes | Record 250 €, 80 €, 90 € on Courses | 62,5 % ok → 82,5 % warning (icon + text) → "Dépassement +20,00 €" |
| 4 | US2 not tracked | Open planned vs actual | Loyer "Non suivi", excluded from actual; tap "Payé comme prévu" → actual 950 €, difference 0 € |
| 5 | US3 offline | Airplane mode, record 2 transactions, kill and reopen the app, network on | Both shown "En attente", then synced once each; visible on Maëlle's device within 5 s |
| 6 | US3 closed while offline | Offline on Fabien's device, record; Maëlle closes the month; reconnect | Fabien gets "Mois clôturé" dialog: move to current month or (if allowed) reopen |
| 7 | US4 suggestion | After 3 "Leclerc" → Courses, type "LECLERC " | Courses preselected |
| 8 | US5 list | Filter payer = joint, group = Recurring shared, search "total" | Only matching rows, total updated |
| 9 | US5 edit/conflict | Both members edit the same transaction amount | Second save shows the newer value and asks |
| 10 | US6 balance | Fabien pays 104,47 € on Courses with his card | "Maëlle doit 26,12 € à Fabien"; mark settled → 0 €; edit the txn to 120 € → new open balance 3,88 € |
| 11 | US7 vouchers | Maëlle records 12,50 € + 45,00 € with "Titre-restaurant" on Courses | Voucher remaining 102,50 €; Fabien owes Maëlle per Courses split (clarification Q2) |
| 12 | US8 recurring | Rule "Loyer" on the 31st; run the job for a 30-day month | One transaction on the 30th, linked to Loyer, marked recurring; re-run → no duplicate |
| 13 | US9 CSV | Import a sample French bank CSV (`;`, Windows-1252, debit/credit columns) containing a purchase already recorded | Mapping asked once; duplicate flagged and unchecked; nothing saved before confirm; re-import → all flagged |
| 14 | Edge: refund | Record `−20,00` refund on Courses | Courses actual decreases by 20 € |
| 15 | Edge: split | 120 € split 90 € Courses / 30 € Maison; then 90/20 | First saves; second refused showing 10,00 € difference |
| 16 | Edge: line deleted | Delete "Animalerie" with 2 transactions | Transactions "Non affectée", flagged; none deleted |
| 17 | Privacy | Maëlle records on her private line; Fabien views list, tracking, hints, receipt URL | Only "Privé" amount in tracking; no label/amount in any response (e2e leak test) |
| 18 | Viewer | Log in as Viewer | No "+" button; all writes → 403 |

## Measuring SC-002 (suggestions kept)

`suggestion_stat` holds counts only (FR-013). Acceptance rate over the last 30 days, per budget:

```sql
SELECT budget_id,
       sum(kept)::numeric / nullif(sum(kept) + sum(changed), 0) AS kept_rate
FROM suggestion_stat
WHERE day >= current_date - 30
GROUP BY budget_id;
```

Target: `kept_rate >= 0.80` after one month of use.

## UI review (constitution gates)

Light and dark mode, largest font scale, VoiceOver (iOS) or TalkBack (Android) on the quick-add
sheet, the keypad, envelope cards and the balance card. Warning/over states must show an icon
and text.
