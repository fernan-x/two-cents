import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import { memberships } from '../../../shared-kernel/infrastructure/db/schema';
import { Membership } from '../../domain/entities/membership';
import type { MembershipRepository } from '../../domain/ports/repositories';

type Row = typeof memberships.$inferSelect;
const toEntity = (row: Row) => Membership.fromPersistence(row);

@Injectable()
export class DrizzleMembershipRepository implements MembershipRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async findById(id: string): Promise<Membership | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(memberships)
      .where(eq(memberships.id, id))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async findCurrent(
    budgetId: string,
    userId: string,
  ): Promise<Membership | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.budgetId, budgetId),
          eq(memberships.userId, userId),
          isNull(memberships.leftAt),
        ),
      )
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async listByBudget(budgetId: string): Promise<Membership[]> {
    const rows = await this.db
      .executor()
      .select()
      .from(memberships)
      .where(eq(memberships.budgetId, budgetId))
      .orderBy(asc(memberships.joinedAt), asc(memberships.id));
    return rows.map(toEntity);
  }

  async listCurrentByUser(userId: string): Promise<Membership[]> {
    const rows = await this.db
      .executor()
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), isNull(memberships.leftAt)));
    return rows.map(toEntity);
  }

  async listAllByUser(userId: string): Promise<Membership[]> {
    const rows = await this.db
      .executor()
      .select()
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .orderBy(asc(memberships.joinedAt));
    return rows.map(toEntity);
  }

  async countCurrent(budgetId: string): Promise<number> {
    const [row] = await this.db
      .executor()
      .select({ n: count() })
      .from(memberships)
      .where(
        and(eq(memberships.budgetId, budgetId), isNull(memberships.leftAt)),
      );
    return row?.n ?? 0;
  }

  async save(membership: Membership): Promise<void> {
    const row = membership.toPersistence();
    await this.db
      .executor()
      .insert(memberships)
      .values(row)
      .onConflictDoUpdate({
        target: memberships.id,
        set: {
          role: row.role,
          displayNameSnapshot: row.displayNameSnapshot,
          leftAt: row.leftAt,
          leftReason: row.leftReason,
          lastOpenedAt: row.lastOpenedAt,
        },
      });
  }
}
