import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import { pendingLinks } from '../../../shared-kernel/infrastructure/db/schema';
import { PendingLink } from '../../domain/entities/pending-link';
import type { PendingLinkRepository } from '../../domain/ports/repositories';

@Injectable()
export class DrizzlePendingLinkRepository implements PendingLinkRepository {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async findById(id: string): Promise<PendingLink | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(pendingLinks)
      .where(eq(pendingLinks.id, id))
      .limit(1);
    return row ? PendingLink.fromPersistence(row) : null;
  }

  async findByTokenHash(hash: string): Promise<PendingLink | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(pendingLinks)
      .where(eq(pendingLinks.linkTokenHash, hash))
      .limit(1);
    return row ? PendingLink.fromPersistence(row) : null;
  }

  async save(link: PendingLink): Promise<void> {
    const row = link.toSnapshot();
    await this.db
      .executor()
      .insert(pendingLinks)
      .values(row)
      .onConflictDoUpdate({ target: pendingLinks.id, set: row });
  }
}
