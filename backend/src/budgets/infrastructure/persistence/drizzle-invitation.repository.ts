import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, lte } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import { invitations } from '../../../shared-kernel/infrastructure/db/schema';
import { Invitation } from '../../domain/entities/invitation';
import type { InvitationRepository } from '../../domain/ports/repositories';

type Row = typeof invitations.$inferSelect;

const toEntity = (row: Row): Invitation =>
  Invitation.fromPersistence({
    ...row,
    codeHash: row.codeHash.toString('hex'),
  });

const toRow = (inv: Invitation): Row => {
  const p = inv.toPersistence();
  return { ...p, codeHash: Buffer.from(p.codeHash, 'hex') };
};

@Injectable()
export class DrizzleInvitationRepository implements InvitationRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async findById(id: string): Promise<Invitation | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(invitations)
      .where(eq(invitations.id, id))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async findByCodeHash(codeHash: string): Promise<Invitation | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(invitations)
      .where(eq(invitations.codeHash, Buffer.from(codeHash, 'hex')))
      .orderBy(desc(invitations.lastSentAt))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async findPendingByEmail(
    budgetId: string,
    emailNormalized: string,
  ): Promise<Invitation | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.budgetId, budgetId),
          eq(invitations.emailNormalized, emailNormalized),
          eq(invitations.kind, 'email'),
          eq(invitations.status, 'pending'),
        ),
      )
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async listByBudget(budgetId: string): Promise<Invitation[]> {
    const rows = await this.db
      .executor()
      .select()
      .from(invitations)
      .where(eq(invitations.budgetId, budgetId))
      .orderBy(desc(invitations.lastSentAt));
    return rows.map(toEntity);
  }

  async countEffectivelyPending(budgetId: string, now: Date): Promise<number> {
    const [row] = await this.db
      .executor()
      .select({ n: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.budgetId, budgetId),
          eq(invitations.status, 'pending'),
          gt(invitations.expiresAt, now),
        ),
      );
    return row?.n ?? 0;
  }

  async save(invitation: Invitation): Promise<void> {
    const row = toRow(invitation);
    await this.db
      .executor()
      .insert(invitations)
      .values(row)
      .onConflictDoUpdate({
        target: invitations.id,
        set: {
          codeHash: row.codeHash,
          status: row.status,
          lastSentAt: row.lastSentAt,
          expiresAt: row.expiresAt,
          sendCount: row.sendCount,
          resolvedAt: row.resolvedAt,
          resolvedBy: row.resolvedBy,
        },
      });
  }

  async acceptIfPending(
    id: string,
    userId: string,
    now: Date,
  ): Promise<boolean> {
    const rows = await this.db
      .executor()
      .update(invitations)
      .set({ status: 'accepted', resolvedAt: now, resolvedBy: userId })
      .where(
        and(
          eq(invitations.id, id),
          eq(invitations.status, 'pending'),
          gt(invitations.expiresAt, now),
        ),
      )
      .returning({ id: invitations.id });
    return rows.length === 1;
  }

  async revokeAllPending(
    budgetId: string,
    by: string | null,
    now: Date,
  ): Promise<number> {
    const rows = await this.db
      .executor()
      .update(invitations)
      .set({ status: 'revoked', resolvedAt: now, resolvedBy: by })
      .where(
        and(
          eq(invitations.budgetId, budgetId),
          eq(invitations.status, 'pending'),
        ),
      )
      .returning({ id: invitations.id });
    return rows.length;
  }

  async revokeAllSentBy(userId: string, now: Date): Promise<number> {
    const rows = await this.db
      .executor()
      .update(invitations)
      .set({ status: 'revoked', resolvedAt: now, resolvedBy: null })
      .where(
        and(
          eq(invitations.invitedBy, userId),
          eq(invitations.status, 'pending'),
        ),
      )
      .returning({ id: invitations.id });
    return rows.length;
  }

  async expireDue(now: Date): Promise<number> {
    const rows = await this.db
      .executor()
      .update(invitations)
      .set({ status: 'expired', resolvedAt: now })
      .where(
        and(eq(invitations.status, 'pending'), lte(invitations.expiresAt, now)),
      )
      .returning({ id: invitations.id });
    return rows.length;
  }
}
