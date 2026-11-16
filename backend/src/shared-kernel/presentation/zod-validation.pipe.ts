import { Body, Injectable, type PipeTransform, Query } from '@nestjs/common';
import type { z } from 'zod';
import { DomainError } from '../domain/domain-error';

/** Validates input against a shared contract schema; invalid input becomes 400 VALIDATION_FAILED. */
@Injectable()
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<
  unknown,
  z.infer<S>
> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new DomainError('VALIDATION_FAILED', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
        message: issue.message,
      })),
    });
  }
}

export const ZodBody = (schema: z.ZodType) =>
  Body(new ZodValidationPipe(schema));
export const ZodQuery = (schema: z.ZodType) =>
  Query(new ZodValidationPipe(schema));
