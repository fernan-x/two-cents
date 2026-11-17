# Quickstart: Validate Monthly Budget Planning

How to prove the feature works end to end. Shapes are in [contracts/rest-api.md](contracts/rest-api.md);
tables and domain functions in [data-model.md](data-model.md); decisions in [research.md](research.md).

## Prerequisites

- Setup from [002 quickstart](../002-shared-budgets/quickstart.md) (Node 24.9+, pnpm, Docker,
  development build on a simulator/emulator)
- A budget "Maison Maëlle & Fabien" with Fabien (owner) and Maëlle (member), on two devices
- A test spreadsheet `.xlsx` with 3 monthly sheets (Septembre–Novembre 2026), one cell holding the
  **text** `12,5`, and the sheet's own "Reste" row showing Maëlle `144,26`

## Setup

```bash
pnpm install --frozen-lockfile
docker compose up -d postgres postgres-test mailpit
pnpm --filter two-cents-backend db:migrate        # adds 003 tables, migrates member_income → income_line
pnpm --filter two-cents-backend start:dev
pnpm --filter two-cents-mobile start
```

## Automated checks (must all pass before merge)

| Command | Proves |
|---------|--------|
| `pnpm --filter @two-cents/shared test` | Planning domain test-first: `splitByWeights` (10,01 € → 5,01 / 5,00), proportional 2 000/3 000 on 500 € → 200/300, `monthlyFromFormula` (80 €/an → 6,67 €; 47 € × 2 → 94,00 €), `transitionMonth`, `copyLinesForNewMonth`, `shouldPropagate`, `monthLabelFor`, import heuristics. **Property tests** (≥ 1 000 random months vs an independent oracle, SC-002). **Fixtures**: Novembre 2026 (SC-003) and both spreadsheet bugs |
| `pnpm --filter two-cents-backend test` | Use cases with in-memory fakes: scope required, propagation only to Draft months not hand-edited, recompute on income change, needs-review on copy, closed month refuses writes, personal-line ownership |
| `pnpm --filter two-cents-backend test:e2e` | Every route in the authz matrix (non-member 404, Viewer 403 on writes; suite fails on a missing case), **private-line leak test** (label/amount never in another member's JSON), `409 stale_state` on concurrent edit, ETag/304, deferred trigger rejects shares ≠ total, migration of `member_income` + 002 income route still works |
| `pnpm --filter two-cents-mobile test` | `AmountField` parsing/errors, month screen summary with overrun icon + text, conflict dialog, import preview diff |
| `pnpm -r lint && pnpm -r typecheck` | Contracts compile on both sides |

## Manual scenarios

1. **Novembre 2026** (US1, SC-003): In Novembre 2026 (scratch), enter incomes Maëlle 2 000,00 / Fabien
   2 990,00 and the fixture lines (one amount typed `12,5`). Summary: Maëlle DI 144,32 · DCR
   1 587,52 · DCE 275,00 · **Reste −6,84 € with ⚠ and "Dépassement"** · Virement 1 862,52;
   Fabien 589,32 · 1 967,52 · 275,00 · Reste 158,16 · Virement 2 242,52.
2. **Invalid input** (FR-026): Type `12,5a`, `12,555`, `-3` → field error, Save disabled, nothing stored.
3. **Live sync** (SC-004): Both devices on Novembre. Maëlle changes "Courses" → Fabien's screen
   updates in < 5 s without touching it. Both edit "Électricité" at once → the second sees
   "Modifié par Maëlle entre-temps" with Keep mine / Keep theirs.
4. **Splits & formulas** (US3): 500 € proportional → 200/300 with incomes 2 000/3 000; switch
   to equal → 250/250; custom 400 total with 100 + 250 → "Il manque 50,00 €", cannot save;
   "80 € par an" → 6,67 € with hint "80 €/an ÷ 12"; change Fabien's salary → proportional line
   updates and the history shows a recompute entry.
5. **Privacy** (US4): Maëlle marks "Psy" 60 € and "Cadeau" 40 € private → Fabien sees
   "Privé — 100,00 €", Maëlle's DI includes it, Fabien cannot edit Maëlle's lines.
6. **Next month in < 3 min** (US2, SC-001): "Nouveau mois" → "À partir du mois précédent" →
   Décembre has every DI/DCR line, no DCE line, incomes badged "À confirmer". Confirm incomes,
   change 3 amounts, add 2 one-off lines. Time it.
7. **Scopes** (US6): In Novembre (Décembre exists as Draft, Loyer untouched there), Loyer 900 →
   950 "À partir de ce mois" → Décembre's Loyer = 950. Courses 400 → 600 "Ce mois-ci
   uniquement" → create Janvier from Novembre → Courses = 400.
8. **Lifecycle** (US5): Activate Novembre → change Courses 280 → 300 → history "Fabien a modifié
   Courses de 280,00 € à 300,00 €". Close → every edit refused, frozen totals shown. As Maëlle
   (Member) no "Rouvrir"; as Fabien reopen → Active, edits allowed.
9. **Templates & past months** (US2, US7): Save Novembre as "Mois type" → create a month from it.
   Open the month list → newest first, negative "Reste" flagged. Duplicate Décembre 2025 with
   "inclure les dépenses exceptionnelles".
10. **Import** (US8): Import the test `.xlsx` → preview maps 3 sheets; `12,5` read as 12,50 €;
    Maëlle "Reste" shown as 144,26 € (sheet) vs −6,84 € (app) highlighted; an unreadable row
    must be fixed or skipped; Novembre "existe déjà" skipped; Cancel → nothing saved; Confirm →
    past months appear as Closed. A `.csv` file is refused with the supported-format message.
11. **Offline**: Airplane mode → month still readable, edit controls disabled with the banner.
12. **Accessibility** (Principles IV, VIII): light/dark, largest font with 6 members, VoiceOver
    reads "Reste à vivre, moins 6 euros 84, dépassement".
