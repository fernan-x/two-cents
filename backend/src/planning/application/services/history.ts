import type { BudgetLine } from '../../domain/entities/budget-line';
import type { IncomeLine } from '../../domain/entities/income-line';
import type { FieldChange } from '../../domain/ports/repositories';

type Snapshot = Record<string, string | null>;

/** The fields of a line as history shows them; amounts as integer strings (FR-035). */
export function lineSnapshot(l: BudgetLine): Snapshot {
  const s: Snapshot = {
    label: l.label,
    group: l.group,
    kind: l.kind,
    categoryId: l.categoryId,
    isEnvelope: String(l.isEnvelope),
    isPrivate: String(l.isPrivate),
    ownerMembershipId: l.ownerMembershipId,
    splitMode: l.splitMode,
    payerMembershipId: l.payerMembershipId,
    totalMinor: l.totalMinor.toString(),
    formula: l.formula
      ? `${l.formula.kind}:${l.formula.baseMinor.toString()}:${l.formula.factor}`
      : null,
    subItems: l.subItems.length
      ? l.subItems.map((i) => `${i.label}=${i.amountMinor ?? ''}`).join('|')
      : null,
  };
  for (const [id, amount] of Object.entries(l.shares))
    s[`share:${id}`] = amount.toString();
  return s;
}

export function incomeSnapshot(i: IncomeLine): Snapshot {
  return {
    label: i.label,
    amountMinor: i.amountMinor.toString(),
    countsTowardHousehold: String(i.countsTowardHousehold),
  };
}

/** Field-level differences between two snapshots (null = absent). */
export function diff(
  before: Snapshot | null,
  after: Snapshot | null,
): FieldChange[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const out: FieldChange[] = [];
  for (const field of keys) {
    const old = before?.[field] ?? null;
    const next = after?.[field] ?? null;
    if (old !== next) out.push({ field, old, new: next });
  }
  return out;
}
