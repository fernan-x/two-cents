import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { LocalDate } from '@two-cents/shared/domain';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import {
  inviteCodeFailures,
  memberIncomes,
  membershipEvents,
  memberships,
  pushDevices,
  sessions,
} from '../../../shared-kernel/infrastructure/db/schema';
import { MemberIncome } from '../../domain/entities/member-income';
import type {
  IncomeRepository,
  InviteCodeFailureLog,
  MembershipEventLog,
  MembershipEventRecord,
  PushDevice,
  PushDeviceRepository,
} from '../../domain/ports/repositories';

@Injectable()
export class DrizzleIncomeRepository implements IncomeRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async find(
    membershipId: string,
    monthStart: LocalDate,
  ): Promise<MemberIncome | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(memberIncomes)
      .where(
        and(
          eq(memberIncomes.membershipId, membershipId),
          eq(memberIncomes.monthStart, monthStart),
        ),
      )
      .limit(1);
    return row ? MemberIncome.fromPersistence(row) : null;
  }

  async listForMonth(
    membershipIds: readonly string[],
    monthStart: LocalDate,
  ): Promise<Map<string, MemberIncome>> {
    if (membershipIds.length === 0) return new Map();
    const rows = await this.db
      .executor()
      .select()
      .from(memberIncomes)
      .where(
        and(
          inArray(memberIncomes.membershipId, [...membershipIds]),
          eq(memberIncomes.monthStart, monthStart),
        ),
      );
    return new Map(
      rows.map((r) => [r.membershipId, MemberIncome.fromPersistence(r)]),
    );
  }

  async listByMemberships(
    membershipIds: readonly string[],
  ): Promise<MemberIncome[]> {
    if (membershipIds.length === 0) return [];
    const rows = await this.db
      .executor()
      .select()
      .from(memberIncomes)
      .where(inArray(memberIncomes.membershipId, [...membershipIds]));
    return rows.map((r) => MemberIncome.fromPersistence(r));
  }

  async existsForBudget(budgetId: string): Promise<boolean> {
    const [row] = await this.db
      .executor()
      .select({ one: sql<number>`1` })
      .from(memberIncomes)
      .innerJoin(memberships, eq(memberships.id, memberIncomes.membershipId))
      .where(eq(memberships.budgetId, budgetId))
      .limit(1);
    return !!row;
  }

  async save(income: MemberIncome): Promise<void> {
    const row = income.toPersistence();
    await this.db
      .executor()
      .insert(memberIncomes)
      .values(row)
      .onConflictDoUpdate({
        target: [memberIncomes.membershipId, memberIncomes.monthStart],
        set: {
          amountMinor: row.amountMinor,
          currency: row.currency,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
        },
      });
  }
}

@Injectable()
export class DrizzleMembershipEventLog implements MembershipEventLog {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async append(event: MembershipEventRecord): Promise<void> {
    await this.db.executor().insert(membershipEvents).values(event);
  }

  async list(
    budgetId: string,
    options: { before?: string; limit: number },
  ): Promise<MembershipEventRecord[]> {
    // Ids are UUID v7, so they sort by creation time.
    const rows = await this.db
      .executor()
      .select()
      .from(membershipEvents)
      .where(
        and(
          eq(membershipEvents.budgetId, budgetId),
          options.before ? lt(membershipEvents.id, options.before) : undefined,
        ),
      )
      .orderBy(desc(membershipEvents.id))
      .limit(options.limit);
    return rows.map((r) => ({
      ...r,
      details: r.details as MembershipEventRecord['details'],
    }));
  }
}

@Injectable()
export class DrizzlePushDeviceRepository implements PushDeviceRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async upsertForSession(device: PushDevice): Promise<void> {
    await this.db.run(async () => {
      const ex = this.db.executor();
      // A token belongs to one session: the latest that registered it.
      await ex
        .delete(pushDevices)
        .where(eq(pushDevices.expoPushToken, device.expoPushToken));
      await ex
        .insert(pushDevices)
        .values(device)
        .onConflictDoUpdate({
          target: pushDevices.sessionId,
          set: {
            expoPushToken: device.expoPushToken,
            platform: device.platform,
            updatedAt: device.updatedAt,
          },
        });
    });
  }

  async deleteForSession(sessionId: string): Promise<void> {
    await this.db
      .executor()
      .delete(pushDevices)
      .where(eq(pushDevices.sessionId, sessionId));
  }

  async tokensForUsers(userIds: readonly string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .executor()
      .select({ token: pushDevices.expoPushToken })
      .from(pushDevices)
      .innerJoin(sessions, eq(sessions.id, pushDevices.sessionId))
      .where(
        and(
          inArray(pushDevices.userId, [...userIds]),
          isNull(sessions.revokedAt),
        ),
      );
    return rows.map((r) => r.token);
  }
}

@Injectable()
export class DrizzleInviteCodeFailureLog implements InviteCodeFailureLog {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async record(id: string, userId: string, at: Date): Promise<void> {
    await this.db
      .executor()
      .insert(inviteCodeFailures)
      .values({ id, userId, failedAt: at });
  }

  async listSince(userId: string, since: Date): Promise<Date[]> {
    const rows = await this.db
      .executor()
      .select({ at: inviteCodeFailures.failedAt })
      .from(inviteCodeFailures)
      .where(
        and(
          eq(inviteCodeFailures.userId, userId),
          gte(inviteCodeFailures.failedAt, since),
        ),
      )
      .orderBy(desc(inviteCodeFailures.failedAt));
    return rows.map((r) => r.at);
  }

  async deleteBefore(cutoff: Date): Promise<number> {
    const rows = await this.db
      .executor()
      .delete(inviteCodeFailures)
      .where(lt(inviteCodeFailures.failedAt, cutoff))
      .returning({ id: inviteCodeFailures.id });
    return rows.length;
  }
}
