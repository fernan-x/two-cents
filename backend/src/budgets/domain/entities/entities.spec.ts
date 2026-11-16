import { Budget } from './budget';
import { Invitation, INVITATION_TTL_MS } from './invitation';
import { MemberIncome } from './member-income';
import { Membership } from './membership';
import { BudgetName } from '../value-objects/budget-name';
import { MonthStartDay } from '../value-objects/month-start-day';

const now = new Date('2026-11-16T10:00:00Z');
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return null;
};

describe('BudgetName and MonthStartDay (FR-001)', () => {
  it('trims and NFC-normalizes; refuses blank and over-60 names', () => {
    expect(BudgetName.create('  Maison Maëlle ').value).toBe('Maison Maëlle');
    expect(code(() => BudgetName.create('   '))).toBe('INVALID_BUDGET_NAME');
    expect(code(() => BudgetName.create('x'.repeat(61)))).toBe(
      'INVALID_BUDGET_NAME',
    );
    expect(BudgetName.create('é'.repeat(60)).value).toHaveLength(60);
  });
  it('accepts 1–28 only', () => {
    expect(MonthStartDay.create(28).value).toBe(28);
    expect(code(() => MonthStartDay.create(29))).toBe('VALIDATION_FAILED');
    expect(code(() => MonthStartDay.create(0))).toBe('VALIDATION_FAILED');
  });
});

describe('Budget', () => {
  const create = (startDay = 1) =>
    Budget.create({
      id: 'b',
      name: BudgetName.create('Maison'),
      currency: 'EUR',
      startDay: MonthStartDay.create(startDay),
      timeZone: 'Europe/Paris',
      createdBy: 'u',
      now,
    });

  it('starts its first rule on the current month start', () => {
    expect(create(28).rules).toEqual([
      { effectiveFrom: '2026-10-28', startDay: 28 },
    ]);
    expect(create(28).currentMonth(now)).toEqual({
      start: '2026-10-28',
      end: '2026-11-27',
    });
  });

  it('applies a start-day change from the next month and can cancel it', () => {
    const b = create(1);
    b.changeStartDay(MonthStartDay.create(28), now);
    expect(b.currentMonth(now)).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
    expect(b.pendingStartDay(now)).toEqual({
      effectiveFrom: '2026-12-01',
      startDay: 28,
    });
    expect(b.monthStartDay(now)).toBe(1);
    b.changeStartDay(MonthStartDay.create(1), now);
    expect(b.pendingStartDay(now)).toBeNull();
  });

  it('locks the currency once amounts exist (FR-006)', () => {
    const b = create();
    b.changeCurrency('USD', false);
    expect(b.currency).toBe('USD');
    expect(code(() => b.changeCurrency('EUR', true))).toBe('CURRENCY_LOCKED');
  });

  it('deletes on the exact name and restores for 30 days, by the deleter only', () => {
    const b = create();
    expect(code(() => b.delete('u', 'maison', now))).toBe(
      'CONFIRM_NAME_MISMATCH',
    );
    b.delete('u', 'Maison', now);
    expect(b.isDeleted).toBe(true);
    expect(code(() => b.restore('other', now))).toBe('BUDGET_NOT_FOUND');
    const late = new Date(now.getTime() + 30 * 86_400_000);
    expect(code(() => b.restore('u', late))).toBe('BUDGET_NOT_FOUND');
    b.restore('u', new Date(late.getTime() - 1));
    expect(b.isDeleted).toBe(false);
  });
});

describe('Membership (FR-027 to FR-030)', () => {
  const join = (role: 'owner' | 'admin' | 'member' | 'viewer', id = role) =>
    Membership.join({ id, budgetId: 'b', userId: `user-${id}`, role, now });

  it('lets the owner or an Admin change non-owner roles', () => {
    const m = join('member');
    m.changeRole('admin', 'admin');
    expect(m.role).toBe('admin');
    expect(code(() => join('owner').changeRole('admin', 'member'))).toBe(
      'CANNOT_MODIFY_OWNER',
    );
    expect(code(() => join('viewer').changeRole('member', 'member'))).toBe(
      'FORBIDDEN',
    );
  });

  it('removal and leaving keep the name; the owner cannot leave', () => {
    const m = join('member');
    m.removeBy('owner', 'Chloé', now);
    expect(m.toPersistence()).toMatchObject({
      leftAt: now,
      leftReason: 'removed',
      displayNameSnapshot: 'Chloé',
    });
    expect(code(() => m.changeRole('owner', 'viewer'))).toBe('STALE_STATE');
    expect(code(() => join('owner').leave('Fabien', now))).toBe(
      'OWNER_MUST_TRANSFER',
    );
  });

  it('transfers ownership: the previous owner becomes Admin', () => {
    const owner = join('owner');
    const member = join('member');
    Membership.transferOwnership(owner, member);
    expect([owner.role, member.role]).toEqual(['admin', 'owner']);
  });

  it('an account deletion ends the membership anonymously', () => {
    const m = join('member');
    m.endForAccountDeletion(now);
    expect(m.toPersistence()).toMatchObject({
      leftReason: 'account_deleted',
      displayNameSnapshot: null,
    });
  });

  it('is included in the month it left only (FR-033)', () => {
    const m = join('member');
    m.leave('Chloé', now);
    expect(m.forMonth('Europe/Paris')).toEqual({
      role: 'member',
      joinedOn: '2026-11-16',
      leftOn: '2026-11-16',
    });
  });
});

describe('Invitation (FR-012, FR-021)', () => {
  const invite = () =>
    Invitation.create({
      id: 'i',
      budgetId: 'b',
      kind: 'email',
      emailNormalized: 'p@example.com',
      role: 'member',
      codeHash: 'aa',
      invitedBy: 'u',
      inviterName: 'Fabien',
      now,
    });

  it('expires 7 days after it was last sent', () => {
    const inv = invite();
    expect(inv.expiresAt.getTime() - now.getTime()).toBe(INVITATION_TTL_MS);
    const later = new Date(now.getTime() + INVITATION_TTL_MS);
    expect(inv.status(later)).toBe('expired');
    expect(code(() => inv.accept('x', later))).toBe('INVITATION_EXPIRED');
  });

  it('resends with a new expiry and code, while pending', () => {
    const inv = invite();
    const later = new Date(now.getTime() + 86_400_000);
    inv.resend(later, 'bb');
    expect(inv.sendCount).toBe(2);
    expect(inv.codeHash).toBe('bb');
    expect(inv.expiresAt.getTime()).toBe(later.getTime() + INVITATION_TTL_MS);
  });

  it('gives a specific reason once resolved', () => {
    const accepted = invite();
    accepted.accept('x', now);
    expect(accepted.goneReason(now)).toBe('INVITATION_USED');
    const declined = invite();
    declined.decline('x', now);
    expect(declined.goneReason(now)).toBe('INVITATION_DECLINED');
    const revoked = invite();
    revoked.revoke('u', now);
    expect(code(() => revoked.assertUsable(now))).toBe('INVITATION_REVOKED');
  });
});

describe('MemberIncome', () => {
  it('refuses negative amounts and a foreign currency', () => {
    const base = {
      membershipId: 'm',
      monthStart: '2026-11-01',
      budgetCurrency: 'EUR',
      by: 'u',
      now,
    };
    expect(
      MemberIncome.record({ ...base, amountMinor: 0n, currency: 'EUR' })
        .amountMinor,
    ).toBe(0n);
    expect(
      code(() =>
        MemberIncome.record({ ...base, amountMinor: -1n, currency: 'EUR' }),
      ),
    ).toBe('INVALID_AMOUNT');
    expect(
      code(() =>
        MemberIncome.record({ ...base, amountMinor: 1n, currency: 'USD' }),
      ),
    ).toBe('INVALID_AMOUNT');
  });
});
