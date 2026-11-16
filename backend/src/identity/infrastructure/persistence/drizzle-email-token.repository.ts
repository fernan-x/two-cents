import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import { emailTokens } from '../../../shared-kernel/infrastructure/db/schema';
import {
  EmailToken,
  type EmailTokenPurpose,
} from '../../domain/entities/email-token';
import type { EmailTokenRepository } from '../../domain/ports/repositories';

@Injectable()
export class DrizzleEmailTokenRepository implements EmailTokenRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async findByHash(hash: string): Promise<EmailToken | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(emailTokens)
      .where(eq(emailTokens.tokenHash, hash))
      .limit(1);
    return row ? EmailToken.fromPersistence(row) : null;
  }

  async save(token: EmailToken): Promise<void> {
    const row = token.toSnapshot();
    await this.db
      .executor()
      .insert(emailTokens)
      .values(row)
      .onConflictDoUpdate({ target: emailTokens.id, set: row });
  }

  async supersedeAll(
    userId: string,
    purpose: EmailTokenPurpose,
    now: Date,
  ): Promise<void> {
    await this.db
      .executor()
      .update(emailTokens)
      .set({ supersededAt: now })
      .where(
        and(
          eq(emailTokens.userId, userId),
          eq(emailTokens.purpose, purpose),
          isNull(emailTokens.usedAt),
          isNull(emailTokens.supersededAt),
        ),
      );
  }
}
