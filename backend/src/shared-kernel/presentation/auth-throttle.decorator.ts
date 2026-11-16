import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

/** Per-IP rate limit for sensitive auth routes (FR-005, FR-006a): 10 requests per minute by default. */
export const AuthThrottle = (limit = 10, ttlMs = 60_000) =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({ default: { limit, ttl: ttlMs } }),
  );
