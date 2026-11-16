import type { TFunction } from 'i18next';

import { ApiError } from './api-client';

/** Translates any thrown error into a user-facing message (errors.<CODE>). */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    const minutes = Math.max(1, Math.ceil((error.details.retryAfterSeconds ?? 60) / 60));
    return t(`errors.${error.code}`, { minutes });
  }
  return t('errors.INTERNAL');
}
