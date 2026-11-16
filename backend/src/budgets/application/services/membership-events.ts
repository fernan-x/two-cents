import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from '../../../shared-kernel/application/ports';
import {
  MEMBERSHIP_EVENT_LOG,
  type MembershipEventLog,
  type MembershipEventRecord,
  type MembershipEventType,
} from '../../domain/ports/repositories';

/** Appends audit events (FR-034). Details are roles and setting names only. */
@Injectable()
export class MembershipEvents {
  constructor(
    @Inject(MEMBERSHIP_EVENT_LOG) private readonly log: MembershipEventLog,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  record(
    budgetId: string,
    type: MembershipEventType,
    actorUserId: string | null,
    targetMembershipId: string | null = null,
    details: MembershipEventRecord['details'] = {},
  ): Promise<void> {
    return this.log.append({
      id: this.ids.next(),
      budgetId,
      type,
      actorUserId,
      targetMembershipId,
      details,
      createdAt: this.clock.now(),
    });
  }
}
