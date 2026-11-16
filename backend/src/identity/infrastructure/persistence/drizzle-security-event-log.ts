import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR,
  type IdGenerator,
  CLOCK,
  type Clock,
} from '../../../shared-kernel/application/ports';
import { DrizzleTransactionRunner } from '../../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import { securityEvents } from '../../../shared-kernel/infrastructure/db/schema';
import type {
  SecurityEventLog,
  SecurityEventType,
} from '../../domain/ports/repositories';
import { RequestContext } from '../../../shared-kernel/infrastructure/http/request-context';

@Injectable()
export class DrizzleSecurityEventLog implements SecurityEventLog {
  constructor(
    private readonly db: DrizzleTransactionRunner,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly requestContext: RequestContext,
  ) {}

  async record(event: {
    type: SecurityEventType;
    userId?: string | null;
    sessionId?: string | null;
  }): Promise<void> {
    const request = this.requestContext.current();
    await this.db
      .executor()
      .insert(securityEvents)
      .values({
        id: this.ids.next(),
        type: event.type,
        userId: event.userId ?? null,
        sessionId: event.sessionId ?? null,
        ipHash: request?.ipHash ?? null,
        userAgentFamily: request?.userAgentFamily ?? null,
        createdAt: this.clock.now(),
      });
  }
}
