import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { LocalDate } from '@two-cents/shared/domain';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import {
  inviteCodeFailures,
  budgetLines,
  budgetMonths,
  incomeLines,
  membershipEvents,
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

/**
 * A member's monthly income, read from spec 003's income lines: the sum of the lines that count
 * toward the household (003 research R13). Writes go through the planning module.
 */
@Injectable()
export class DrizzleIncomeRepository implements IncomeRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  private async sums(
    membershipIds: readonly string[],
    monthStart?: LocalDate,
  ): Promise<MemberIncome[]> {
    if (membershipIds.length === 0) return [];
    const rows = await this.db
      .executor()
      .select({
        membershipId: incomeLines.membershipId,
        monthStart: budgetMonths.periodStart,
        amountMinor: sql<string>`sum(${incomeLines.amountMinor})`,
        currency: sql<string>`min(${incomeLines.currency})`,
        updatedAt: sql<Date>`max(${incomeLines.updatedAt})`,
      })
      .from(incomeLines)
      .innerJoin(budgetMonths, eq(budgetMonths.id, incomeLines.monthId))
      .where(
        and(
          inArray(incomeLines.membershipId, [...membershipIds]),
          eq(incomeLines.countsTowardHousehold, true),
          monthStart ? eq(budgetMonths.periodStart, monthStart) : undefined,
        ),
      )
      .groupBy(incomeLines.membershipId, budgetMonths.periodStart)
      .orderBy(budgetMonths.periodStart);
    return rows.map((r) =>
      MemberIncome.fromPersistence({
        membershipId: r.membershipId,
        monthStart: r.monthStart,
        amountMinor: BigInt(r.amountMinor),
        currency: r.currency,
        updatedAt: new Date(r.updatedAt),
        updatedBy: null,
      }),
    );
  }

  async find(
    membershipId: string,
    monthStart: LocalDate,
  ): Promise<MemberIncome | null> {
    const [income] = await this.sums([membershipId], monthStart);
    return income ?? null;
  }

  async listForMonth(
    membershipIds: readonly string[],
    monthStart: LocalDate,
  ): Promise<Map<string, MemberIncome>> {
    const incomes = await this.sums(membershipIds, monthStart);
    return new Map(incomes.map((i) => [i.membershipId, i]));
  }

  listByMemberships(membershipIds: readonly string[]): Promise<MemberIncome[]> {
    return this.sums(membershipIds);
  }

  /** Any income line or budget line locks the currency (FR-006). */
  async existsForBudget(budgetId: string): Promise<boolean> {
    const result = await this.db.executor().execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM ${incomeLines}
        JOIN ${budgetMonths} ON ${budgetMonths.id} = ${incomeLines.monthId}
        WHERE ${budgetMonths.budgetId} = ${budgetId}
      ) OR EXISTS (
        SELECT 1 FROM ${budgetLines} WHERE ${budgetLines.budgetId} = ${budgetId}
      ) AS "exists"`);
    return result.rows[0]?.exists === true;
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
