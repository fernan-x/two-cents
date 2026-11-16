import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import { authIdentities } from '../../../shared-kernel/infrastructure/db/schema';
import {
  AuthIdentity,
  type IdentityProvider,
} from '../../domain/entities/auth-identity';
import type { AuthIdentityRepository } from '../../domain/ports/repositories';
import type { SignInMethodsReader } from '../../application/ports/sign-in-methods';

@Injectable()
export class DrizzleAuthIdentityRepository
  implements AuthIdentityRepository, SignInMethodsReader
{
  constructor(private readonly db: DrizzleTransactionRunner) {}

  async findByProviderSubject(
    provider: IdentityProvider,
    subject: string,
  ): Promise<AuthIdentity | null> {
    const [row] = await this.db
      .executor()
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, provider),
          eq(authIdentities.providerSubject, subject),
        ),
      )
      .limit(1);
    return row ? AuthIdentity.fromPersistence(row) : null;
  }

  async listByUser(userId: string): Promise<AuthIdentity[]> {
    const rows = await this.db
      .executor()
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.userId, userId))
      .orderBy(authIdentities.createdAt);
    return rows.map((row) => AuthIdentity.fromPersistence(row));
  }

  async save(identity: AuthIdentity): Promise<void> {
    const row = identity.toSnapshot();
    await this.db
      .executor()
      .insert(authIdentities)
      .values(row)
      .onConflictDoUpdate({ target: authIdentities.id, set: row });
  }

  async delete(id: string): Promise<void> {
    await this.db
      .executor()
      .delete(authIdentities)
      .where(eq(authIdentities.id, id));
  }

  async providersFor(userId: string): Promise<Array<'apple' | 'google'>> {
    return (await this.listByUser(userId)).map((i) => i.provider);
  }
}
