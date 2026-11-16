import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac } from 'node:crypto';
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ENV, type Env } from '../config/env';

export interface RequestInfo {
  /** HMAC of the client IP: lets us group abuse without storing IPs (data-model security_events). */
  ipHash: string | null;
  /** First product token of the User-Agent, e.g. "TwoCents/1.0". */
  userAgentFamily: string | null;
}

@Injectable()
export class RequestContext {
  private readonly storage = new AsyncLocalStorage<RequestInfo>();

  current(): RequestInfo | undefined {
    return this.storage.getStore();
  }

  run<T>(info: RequestInfo, work: () => T): T {
    return this.storage.run(info, work);
  }
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly context: RequestContext,
    @Inject(ENV) private readonly env: Env,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const ip = req.ip ?? null;
    const userAgent = req.headers['user-agent'];
    this.context.run(
      {
        ipHash: ip
          ? createHmac('sha256', Buffer.from(this.env.IP_HASH_KEY, 'base64'))
              .update(ip)
              .digest('hex')
          : null,
        userAgentFamily: userAgent
          ? userAgent.split(/\s+/)[0].slice(0, 40)
          : null,
      },
      next,
    );
  }
}
