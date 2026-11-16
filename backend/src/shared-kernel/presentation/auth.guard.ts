import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  type AuthContext,
  Authenticator,
} from '../../identity/application/services/authenticator';
import { DomainError } from '../domain/domain-error';

export type { AuthContext };

const ALLOW_PENDING_DELETION = 'auth:allowPendingDeletion';

/** Marks a route usable by an account waiting for permanent deletion (contracts/api.md). */
export const AllowPendingDeletion = () =>
  SetMetadata(ALLOW_PENDING_DELETION, true);

type AuthedRequest = Request & { auth?: AuthContext };

/**
 * Verifies the bearer token against a live session and attaches
 * `{ userId, sessionId, emailConfirmed, firstName, status }` to the request (spec 002 R4).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authenticator: Authenticator,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;
    const auth = await this.authenticator.authenticate(token);
    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_DELETION,
      [context.getHandler(), context.getClass()],
    );
    if (auth.status === 'pending_deletion' && !allowPending) {
      throw new DomainError('ACCOUNT_PENDING_DELETION');
    }
    request.auth = auth;
    return true;
  }
}

/** The authenticated caller; only valid on routes behind AuthGuard. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthContext => {
    const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
    if (!auth) throw new DomainError('UNAUTHENTICATED');
    return auth;
  },
);
