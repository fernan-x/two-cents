import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  AUTH_IDENTITY_REPOSITORY,
  type AuthIdentityRepository,
  SESSION_REPOSITORY,
  type SessionRepository,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/repositories';
import { BUDGET_EXPORT_PORT, type BudgetExportPort } from '../ports/budgets';
import {
  EXPORT_ARCHIVE_BUILDER,
  type ExportArchiveBuilder,
  type UserExport,
} from '../ports/export';

/** US8: all of the user's data as JSON + CSV (FR-040). */
@Injectable()
export class ExportData {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUTH_IDENTITY_REPOSITORY)
    private readonly identities: AuthIdentityRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(BUDGET_EXPORT_PORT) private readonly budgets: BudgetExportPort,
    @Inject(EXPORT_ARCHIVE_BUILDER)
    private readonly archive: ExportArchiveBuilder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async collect(userId: string): Promise<UserExport> {
    const user = await this.users.findById(userId);
    if (!user) throw new DomainError('UNAUTHENTICATED');
    const now = this.clock.now();
    const p = user.toSnapshot();
    const identities = await this.identities.listByUser(userId);
    const sessions = await this.sessions.listActiveByUser(userId, now);
    const budgetData = await this.budgets.exportForUser(userId);
    return {
      exportedAt: now.toISOString(),
      profile: {
        id: p.id,
        email: p.email,
        emailConfirmed: p.emailConfirmedAt !== null,
        firstName: p.firstName,
        avatar: p.avatarKey,
        color: p.colorKey,
        language: p.locale,
        preferredCurrency: p.currency,
        createdAt: p.createdAt.toISOString(),
      },
      signInMethods: [
        ...(p.passwordHash
          ? [
              {
                method: 'password',
                email: p.email,
                linkedAt: p.createdAt.toISOString(),
              },
            ]
          : []),
        ...identities.map((i) => {
          const s = i.toSnapshot();
          return {
            method: s.provider,
            email: s.providerEmail,
            linkedAt: s.createdAt.toISOString(),
          };
        }),
      ],
      sessions: sessions.map((s) => {
        const x = s.toSnapshot();
        return {
          device: x.deviceName,
          platform: x.devicePlatform,
          signedInAt: x.createdAt.toISOString(),
          lastActiveAt: x.lastUsedAt.toISOString(),
        };
      }),
      budgets: budgetData.budgets,
      entries: budgetData.entries,
      sections: budgetData.sections ?? {},
      files: budgetData.files ?? [],
    };
  }

  async execute(userId: string): Promise<Uint8Array> {
    return this.archive.build(await this.collect(userId));
  }
}
