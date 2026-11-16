import { Injectable } from '@nestjs/common';
import { and, eq, lte } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import { users } from '../../../shared-kernel/infrastructure/db/schema';
import { User, type UserProps } from '../../domain/entities/user';
import type { UserRepository } from '../../domain/ports/repositories';
import type { Locale } from '../../domain/value-objects/locale';

type UserRow = typeof users.$inferSelect;

const toEntity = (row: UserRow): User =>
  User.fromPersistence({
    ...row,
    locale: row.locale as Locale,
  } satisfies UserProps);

@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async findByNormalizedEmail(emailNormalized: string): Promise<User | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(users)
      .where(eq(users.emailNormalized, emailNormalized))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async save(user: User): Promise<void> {
    const row = user.toSnapshot();
    await this.db
      .executor()
      .insert(users)
      .values(row)
      .onConflictDoUpdate({ target: users.id, set: row });
  }

  async delete(id: string): Promise<void> {
    await this.db.executor().delete(users).where(eq(users.id, id));
  }

  async findDueForDeletion(now: Date, limit: number): Promise<User[]> {
    const rows = await this.db
      .executor()
      .select()
      .from(users)
      .where(
        and(
          eq(users.status, 'pending_deletion'),
          lte(users.deletionScheduledAt, now),
        ),
      )
      .orderBy(users.deletionScheduledAt)
      .limit(limit);
    return rows.map(toEntity);
  }
}
