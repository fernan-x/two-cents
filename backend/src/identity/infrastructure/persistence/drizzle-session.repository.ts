import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { SESSION_IDLE_LIMIT_MS } from '@two-cents/shared/domain';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import { sessions } from '../../../shared-kernel/infrastructure/db/schema';
import {
  Session,
  type SessionRevokedReason,
} from '../../domain/entities/session';
import type { SessionRepository } from '../../domain/ports/repositories';

type SessionRow = typeof sessions.$inferSelect;
const toEntity = (row: SessionRow): Session => Session.fromPersistence(row);

@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async findById(id: string): Promise<Session | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async findByRefreshHash(hash: string): Promise<Session | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, hash))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async findByPreviousRefreshHash(hash: string): Promise<Session | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(sessions)
      .where(eq(sessions.previousRefreshTokenHash, hash))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async listActiveByUser(userId: string, now: Date): Promise<Session[]> {
    const idleCutoff = new Date(now.getTime() - SESSION_IDLE_LIMIT_MS);
    const rows = await this.db
      .executor()
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.lastUsedAt, idleCutoff),
        ),
      )
      .orderBy(sessions.createdAt);
    return rows.map(toEntity);
  }

  async save(session: Session): Promise<void> {
    const row = session.toSnapshot();
    await this.db
      .executor()
      .insert(sessions)
      .values(row)
      .onConflictDoUpdate({ target: sessions.id, set: row });
  }

  async revokeAllForUser(
    userId: string,
    reason: SessionRevokedReason,
    now: Date,
    exceptSessionId?: string,
  ): Promise<number> {
    const conditions = [
      eq(sessions.userId, userId),
      isNull(sessions.revokedAt),
    ];
    if (exceptSessionId) conditions.push(ne(sessions.id, exceptSessionId));
    const revoked = await this.db
      .executor()
      .update(sessions)
      .set({ revokedAt: now, revokedReason: reason })
      .where(and(...conditions))
      .returning({ id: sessions.id });
    return revoked.length;
  }
}
