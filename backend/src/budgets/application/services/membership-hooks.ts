import { Injectable } from '@nestjs/common';

export interface MembershipJoinedHandler {
  /** Runs inside the join transaction (spec 003 research R8). */
  memberJoined(budgetId: string, membershipId: string): Promise<void>;
}

/**
 * Lets later features react to people joining without this module depending on them: spec 003's
 * planning module registers itself here at startup to fit open months to the new member.
 */
@Injectable()
export class MembershipHooks {
  private readonly joined: MembershipJoinedHandler[] = [];

  onJoined(handler: MembershipJoinedHandler): void {
    this.joined.push(handler);
  }

  async memberJoined(budgetId: string, membershipId: string): Promise<void> {
    for (const handler of this.joined)
      await handler.memberJoined(budgetId, membershipId);
  }
}
