import {
  type Formula,
  type Group,
  type Kind,
  MAX_AMOUNT_MINOR,
  type SplitMode,
} from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';

export interface SubItem {
  id: string;
  label: string;
  amountMinor: bigint | null;
  position: number;
}

/** The amount fields of a line: what "this month only" saves and propagation copies (research R7). */
export interface AmountFields {
  totalMinor: bigint;
  splitMode: SplitMode | null;
  payerMembershipId: string | null;
  shares: Record<string, bigint>;
  formula: Formula | null;
}

export interface BudgetLineProps extends AmountFields {
  id: string;
  monthId: string;
  budgetId: string;
  seriesId: string;
  group: Group;
  kind: Kind;
  label: string;
  categoryId: string | null;
  isEnvelope: boolean;
  ownerMembershipId: string | null;
  isPrivate: boolean;
  currency: string;
  position: number;
  version: number;
  handEdited: boolean;
  usual: AmountFields | null;
  needsReview: boolean;
  needsIncome: boolean;
  subItems: SubItem[];
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export const RECURRING_GROUPS: readonly Group[] = [
  'personal',
  'recurring_shared',
];

/** A planned amount with one share per member (data-model.md `budget_line`). */
export class BudgetLine {
  private constructor(private props: BudgetLineProps) {
    this.assertInvariants();
  }

  static create(props: BudgetLineProps): BudgetLine {
    return new BudgetLine({ ...props, shares: { ...props.shares } });
  }

  static fromPersistence(props: BudgetLineProps): BudgetLine {
    return new BudgetLine(props);
  }

  toPersistence(): BudgetLineProps {
    return { ...this.props, shares: { ...this.props.shares } };
  }

  /** The same line in a new state, one version later (research R5). */
  update(
    changes: Partial<Omit<BudgetLineProps, 'id' | 'monthId' | 'version'>>,
    by: string | null,
    now: Date,
  ): void {
    this.props = {
      ...this.props,
      ...changes,
      version: this.props.version + 1,
      updatedAt: now,
      updatedBy: by,
    };
    this.assertInvariants();
  }

  amountFields(): AmountFields {
    return {
      totalMinor: this.props.totalMinor,
      splitMode: this.props.splitMode,
      payerMembershipId: this.props.payerMembershipId,
      shares: { ...this.props.shares },
      formula: this.props.formula,
    };
  }

  private assertInvariants(): void {
    const p = this.props;
    const personal = p.group === 'personal';
    if (personal !== (p.ownerMembershipId !== null))
      throw new Error('personal line ⇔ owner');
    if (personal !== (p.splitMode === null))
      throw new Error('personal line ⇔ no split mode');
    if (p.isPrivate && !personal)
      throw new DomainError('VALIDATION_FAILED', {
        issues: [{ path: ['isPrivate'], message: 'personal lines only' }],
      });
    if ((p.splitMode === 'one_payer') !== (p.payerMembershipId !== null))
      throw new Error('one_payer ⇔ payer');
    if (p.totalMinor < 0n) throw new DomainError('INVALID_AMOUNT');
    if (p.totalMinor > MAX_AMOUNT_MINOR)
      throw new DomainError('AMOUNT_TOO_LARGE');
    const sum = Object.values(p.shares).reduce((s, v) => s + v, 0n);
    if (sum !== p.totalMinor)
      throw new Error('shares must add up to the total');
    if (personal) {
      const ids = Object.keys(p.shares);
      if (ids.length !== 1 || ids[0] !== p.ownerMembershipId)
        throw new Error('a personal line has exactly its owner share');
    }
  }

  get id() {
    return this.props.id;
  }
  get monthId() {
    return this.props.monthId;
  }
  get seriesId() {
    return this.props.seriesId;
  }
  get group() {
    return this.props.group;
  }
  get kind() {
    return this.props.kind;
  }
  get label() {
    return this.props.label;
  }
  get categoryId() {
    return this.props.categoryId;
  }
  get isEnvelope() {
    return this.props.isEnvelope;
  }
  get ownerMembershipId() {
    return this.props.ownerMembershipId;
  }
  get isPrivate() {
    return this.props.isPrivate;
  }
  get splitMode() {
    return this.props.splitMode;
  }
  get payerMembershipId() {
    return this.props.payerMembershipId;
  }
  get totalMinor() {
    return this.props.totalMinor;
  }
  get shares(): Readonly<Record<string, bigint>> {
    return this.props.shares;
  }
  get formula() {
    return this.props.formula;
  }
  get position() {
    return this.props.position;
  }
  get version() {
    return this.props.version;
  }
  get handEdited() {
    return this.props.handEdited;
  }
  get usual() {
    return this.props.usual;
  }
  get needsReview() {
    return this.props.needsReview;
  }
  get needsIncome() {
    return this.props.needsIncome;
  }
  get subItems(): readonly SubItem[] {
    return this.props.subItems;
  }
  get isRecurring() {
    return RECURRING_GROUPS.includes(this.props.group);
  }
}
