import { ApiError as ApiErrorSchema, type ErrorCode, type SessionEndReason } from '@two-cents/shared/contracts';
import type { z } from 'zod';

import { config } from '@/config';
import { tokenStore } from './token-store';

/** A failed API call, with the stable error code from the contract (or NETWORK when unreachable). */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    readonly status: number,
    readonly details: {
      retryAfterSeconds?: number;
      reason?: SessionEndReason;
      linkToken?: string;
      emailHint?: string;
      /** Spec 002: who sent an invitation that can no longer be used. */
      inviterName?: string;
      /** Spec 002: masked address of an email invitation for someone else. */
      invitedEmailMasked?: string;
      /** Spec 002: the budget the caller already belongs to. */
      budgetId?: string;
      /** Spec 002: the up-to-date resource on STALE_STATE. */
      current?: unknown;
      /** Spec 003: total minus the entered shares, signed minor units (SPLIT_MISMATCH). */
      differenceMinor?: string;
      /** Spec 003: lines blocking activation (LINES_NEED_REVIEW). */
      lineIds?: string[];
      /** Spec 003: the import preview explaining IMPORT_INVALID. */
      preview?: unknown;
      /** Spec 004 (MONTH_NOT_FOUND on a transaction): the period with no month, and whether I may create it. */
      periodStart?: string;
      canCreate?: boolean;
      /** Spec 004 (MONTH_CLOSED on a transaction): the closed month, and whether I may reopen it. */
      monthStart?: string;
      canReopen?: boolean;
    } = {},
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
  /** Extra request headers (spec 003: `If-None-Match`). */
  headers?: Record<string, string>;
  /** Spec 004: a binary body (receipt photo) instead of JSON. */
  rawBody?: { contentType: string; data: Uint8Array };
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

/** Sends the request (token, timeout, one refresh on 401) and throws ApiError on any non-2xx except 304. */
async function send<S extends z.ZodType | undefined>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions<S>,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.rawBody) headers['Content-Type'] = options.rawBody.contentType;
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
      body: options.rawBody
        ? (options.rawBody.data as unknown as BodyInit)
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
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
        return send(method, path, { ...options, retried: true });
      }
    }
  }

  if (!response.ok && response.status !== 304) {
    const error = await toApiError(response);
    if (error.code === 'SESSION_ENDED' && options.auth !== false) onSessionEnded?.(error.details.reason);
    throw error;
  }
  return response;
}

export async function apiRequest<S extends z.ZodType | undefined = undefined>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions<S> = {},
): Promise<S extends z.ZodType ? z.infer<S> : undefined> {
  const response = await send(method, path, options);
  if (response.status === 304) throw new ApiError('INTERNAL', 304); // only conditional GETs expect 304
  if (response.status === 204 || !options.schema) return undefined as never;
  const json: unknown = await response.json();
  return options.schema.parse(json) as never;
}

/** A conditional GET (spec 003 research R4): `notModified` when `etag` still matches, else the parsed body. */
export async function apiConditionalGet<S extends z.ZodType>(
  path: string,
  schema: S,
  etag: string | null,
): Promise<{ notModified: true; etag: string | null } | { notModified: false; etag: string | null; data: z.infer<S> }> {
  const response = await send('GET', path, { schema, headers: etag ? { 'If-None-Match': etag } : undefined });
  const responseEtag = response.headers?.get?.('ETag') ?? null;
  if (response.status === 304) return { notModified: true, etag: responseEtag ?? etag };
  const json: unknown = await response.json();
  return { notModified: false, etag: responseEtag, data: schema.parse(json) };
}

async function toApiError(response: Response): Promise<ApiError> {
  const json = await response.json().catch(() => null);
  const parsed = ApiErrorSchema.safeParse(json);
  if (!parsed.success) return new ApiError('INTERNAL', response.status);
  const { error, ...details } = parsed.data;
  return new ApiError(error, response.status, details);
}
