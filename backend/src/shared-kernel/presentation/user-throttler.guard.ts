import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Rate limit per signed-in user instead of per IP. Use after AuthGuard. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const userId = (req.auth as { userId?: string } | undefined)?.userId;
    return Promise.resolve(userId ? `user:${userId}` : String(req.ip));
  }
}
