import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { ApiError } from '@two-cents/shared/contracts';
import { PlanningError } from '@two-cents/shared/domain';
import type { Response } from 'express';
import { DomainError } from '../domain/domain-error';
import { HTTP_STATUS } from './http-status';

/** Turns every error into the `{ error, ... }` body of contracts/api.md. */
@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.toResponse(exception);
    if (body.retryAfterSeconds !== undefined)
      response.setHeader('Retry-After', String(body.retryAfterSeconds));
    response.status(status).json(body);
  }

  private toResponse(exception: unknown): [number, ApiError] {
    if (exception instanceof DomainError) {
      const { status, ...details } = exception.details;
      return [
        status ?? HTTP_STATUS[exception.code],
        { error: exception.code, ...details },
      ];
    }
    if (exception instanceof PlanningError) {
      // Shared planning rules (spec 003) use the same codes as the API.
      const difference = exception.details?.differenceMinor;
      return [
        HTTP_STATUS[exception.code],
        {
          error: exception.code,
          ...(typeof difference === 'bigint'
            ? { differenceMinor: difference.toString() }
            : {}),
        },
      ];
    }
    if (exception instanceof ThrottlerException) {
      return [
        HttpStatus.TOO_MANY_REQUESTS,
        { error: 'RATE_LIMITED', retryAfterSeconds: 60 },
      ];
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) return [404, { error: 'NOT_FOUND' }];
      if (status === 401) return [401, { error: 'UNAUTHENTICATED' }];
      if (status === 400) return [400, { error: 'VALIDATION_FAILED' }];
      if (status < 500) return [status, { error: 'VALIDATION_FAILED' }];
    }
    this.logger.error({ err: exception }, 'unhandled error');
    return [500, { error: 'INTERNAL' }];
  }
}
