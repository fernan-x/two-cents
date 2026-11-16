import { ApiError as ApiErrorSchema, type ErrorCode, type SessionEndReason } from '@two-cents/shared/contracts';
import type { z } from 'zod';

import { config } from '@/config';
import { tokenStore } from './token-store';

/** A failed API call, with the stable error code from the contract (or NETWORK when unreachable). */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    readonly status: number,
    readonly details: { retryAfterSeconds?: number; reason?: SessionEndReason; linkToken?: string; emailHint?: string } = {},
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export interface RequestOptions<S extends z.ZodType | undefined> {
  body?: unknown;
  schema?: S;
  /** Send the access token (default true). */
  auth?: boolean;
  /** Internal: set when retrying after a refresh. */
  retried?: boolean;
}

const REQUEST_TIMEOUT_MS = 15_000;

type Refresher = () => Promise<boolean>;
let refresher: Refresher | null = null;
let onSessionEnded: ((reason: SessionEndReason | undefined) => void) | null = null;

/** Registered by the auth layer: called when the server says this device's session is over. */
export function setSessionEndedHandler(fn: typeof onSessionEnded): void {
  onSessionEnded = fn;
}

/** Registered by the auth layer; called once on a 401 to renew the access token. */
export function setRefresher(fn: Refresher | null): void {
  refresher = fn;
}

export async function apiRequest<S extends z.ZodType | undefined = undefined>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions<S> = {},
): Promise<S extends z.ZodType ? z.infer<S> : undefined> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = options.auth === false ? null : tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  // Without a timeout, a wrong API address leaves screens loading forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('NETWORK', 0);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 && options.auth !== false && !options.retried && refresher) {
    const body = await response.clone().json().catch(() => null);
    const code = (body as { error?: string } | null)?.error;
    if (code === 'UNAUTHENTICATED' || code === 'SESSION_ENDED') {
      if (code === 'UNAUTHENTICATED' && (await refresher())) {
        return apiRequest(method, path, { ...options, retried: true });
      }
    }
  }

  if (!response.ok) {
    const error = await toApiError(response);
    if (error.code === 'SESSION_ENDED' && options.auth !== false) onSessionEnded?.(error.details.reason);
    throw error;
  }
  if (response.status === 204 || !options.schema) return undefined as never;
  const json: unknown = await response.json();
  return options.schema.parse(json) as never;
}

async function toApiError(response: Response): Promise<ApiError> {
  const json = await response.json().catch(() => null);
  const parsed = ApiErrorSchema.safeParse(json);
  if (!parsed.success) return new ApiError('INTERNAL', response.status);
  const { error, retryAfterSeconds, reason, linkToken, emailHint } = parsed.data;
  return new ApiError(error, response.status, { retryAfterSeconds, reason, linkToken, emailHint });
}
