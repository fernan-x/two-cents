import { MAX_AMOUNT_MINOR } from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';

export interface IncomeLineProps {
  id: string;
  monthId: string;
  membershipId: string;
  label: string | null;
  amountMinor: bigint;
  currency: string;
  countsTowardHousehold: boolean;
  /** Spec 004: meal vouchers (Swile…), never household-counted (research R8). Defaults to false. */
  isMealVoucher?: boolean;
  toConfirm: boolean;
  isPrimary: boolean;
  position: number;
  version: number;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

/** One income of one member for one month (FR-009). Only its member writes it (FR-010). */
export class IncomeLine {
  private constructor(private props: IncomeLineProps) {
    IncomeLine.assertAmount(props.amountMinor);
    this.props = IncomeLine.normalize(props);
  }

  /** A meal-voucher income never counts toward the household (spec 004 R8). */
  private static normalize(props: IncomeLineProps): IncomeLineProps {
    const isMealVoucher = props.isMealVoucher ?? false;
    return {
      ...props,
      isMealVoucher,
      countsTowardHousehold: isMealVoucher
        ? false
        : props.countsTowardHousehold,
    };
  }

  static assertAmount(amount: bigint): void {
    if (amount < 0n) throw new DomainError('INVALID_AMOUNT');
    if (amount > MAX_AMOUNT_MINOR) throw new DomainError('AMOUNT_TOO_LARGE');
  }

  static create(props: IncomeLineProps): IncomeLine {
    return new IncomeLine({ ...props });
  }

  static fromPersistence(props: IncomeLineProps): IncomeLine {
    return new IncomeLine(props);
  }

  toPersistence(): IncomeLineProps {
    return { ...this.props };
  }

  /** Any edit by its member confirms a pre-filled income (FR-006). */
  update(
    changes: Partial<
      Pick<
        IncomeLineProps,
        'label' | 'amountMinor' | 'countsTowardHousehold' | 'isMealVoucher'
      >
    >,
    by: string,
    now: Date,
  ): void {
    if (changes.amountMinor !== undefined)
      IncomeLine.assertAmount(changes.amountMinor);
    this.props = IncomeLine.normalize({
      ...this.props,
      ...changes,
      toConfirm: false,
      version: this.props.version + 1,
      updatedAt: now,
      updatedBy: by,
    });
  }

  confirm(by: string, now: Date): boolean {
    if (!this.props.toConfirm) return false;
    this.props = {
      ...this.props,
      toConfirm: false,
      version: this.props.version + 1,
      updatedAt: now,
      updatedBy: by,
    };
    return true;
  }

  get id() {
    return this.props.id;
  }
  get monthId() {
    return this.props.monthId;
  }
  get membershipId() {
    return this.props.membershipId;
  }
  get label() {
    return this.props.label;
  }
  get amountMinor() {
    return this.props.amountMinor;
  }
  get countsTowardHousehold() {
    return this.props.countsTowardHousehold;
  }
  get isMealVoucher() {
    return this.props.isMealVoucher ?? false;
  }
  get toConfirm() {
    return this.props.toConfirm;
  }
  get isPrimary() {
    return this.props.isPrimary;
  }
  get position() {
    return this.props.position;
  }
  get version() {
    return this.props.version;
  }
}
