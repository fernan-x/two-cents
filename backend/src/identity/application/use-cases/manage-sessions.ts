import { Inject, Injectable } from '@nestjs/common';
import type { SessionsResponse } from '@two-cents/shared/contracts';
import {
  CLOCK,
  type Clock,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  SECURITY_EVENT_LOG,
  type SecurityEventLog,
  SESSION_REPOSITORY,
  type SessionRepository,
} from '../../domain/ports/repositories';

/** US7: the signed-in devices of the caller (FR-022). */
@Injectable()
export class ListSessions {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(auth: {
    userId: string;
    sessionId: string;
  }): Promise<SessionsResponse> {
    const sessions = await this.sessions.listActiveByUser(
      auth.userId,
      this.clock.now(),
    );
    return {
      sessions: sessions.map((s) => {
        const p = s.toSnapshot();
        return {
          id: p.id,
          deviceName: p.deviceName,
          platform: p.devicePlatform,
          signedInAt: p.createdAt.toISOString(),
          lastActiveAt: p.lastUsedAt.toISOString(),
          current: p.id === auth.sessionId,
        };
      }),
    };
  }
}

/** US7: end one other device's session (FR-023). */
@Injectable()
export class RevokeSession {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    auth: { userId: string; sessionId: string },
    sessionId: string,
  ): Promise<void> {
    if (sessionId === auth.sessionId)
      throw new DomainError('CANNOT_REVOKE_CURRENT');
    const session = await this.sessions.findById(sessionId);
    // Someone else's session looks exactly like a missing one.
    if (!session || session.userId !== auth.userId)
      throw new DomainError('NOT_FOUND');
    await this.tx.run(async () => {
      session.revoke('revoked_by_user', this.clock.now());
      await this.sessions.save(session);
      await this.events.record({
        type: 'session_revoked',
        userId: auth.userId,
        sessionId,
      });
    });
  }
}

/** US7: "log out of all other devices" (FR-023). */
@Injectable()
export class RevokeOtherSessions {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(auth: {
    userId: string;
    sessionId: string;
  }): Promise<{ revokedCount: number }> {
    return this.tx.run(async () => {
      const revokedCount = await this.sessions.revokeAllForUser(
        auth.userId,
        'revoked_by_user',
        this.clock.now(),
        auth.sessionId,
      );
      if (revokedCount > 0)
        await this.events.record({
          type: 'session_revoked',
          userId: auth.userId,
        });
      return { revokedCount };
    });
  }
}
