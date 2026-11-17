import { z } from 'zod';

import { ApiError, apiConditionalGet, apiRequest, setRefresher } from './api-client';
import { tokenStore } from './token-store';

const withEtag = (status: number, body: unknown, etag: string | null) =>
  ({
    ok: status < 400 && status !== 304,
    status,
    json: async () => body,
    headers: { get: (name: string) => (name.toLowerCase() === 'etag' ? etag : null) },
    clone() {
      return this;
    },
  }) as unknown as Response;

const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body, clone() { return this; } }) as unknown as Response;

describe('apiRequest', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
    tokenStore.set('access-1');
    setRefresher(null);
  });

  it('sends the bearer token and parses with the schema', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    const result = await apiRequest('GET', '/v1/me', { schema: z.object({ ok: z.boolean() }) });
    expect(result).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer access-1');
  });

  it('turns error bodies into ApiError with the contract code', async () => {
    fetchMock.mockResolvedValue(json(423, { error: 'ACCOUNT_LOCKED', retryAfterSeconds: 900 }));
    await expect(apiRequest('POST', '/v1/auth/login', { body: {}, auth: false })).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
      status: 423,
      details: { retryAfterSeconds: 900 },
    });
  });

  it('reports NETWORK when the server is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(apiRequest('GET', '/v1/me')).rejects.toEqual(new ApiError('NETWORK', 0));
  });

  it('refreshes once on an expired access token, then retries', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: 'UNAUTHENTICATED' }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const refresher = jest.fn(async () => {
      tokenStore.set('access-2');
      return true;
    });
    setRefresher(refresher);
    await apiRequest('GET', '/v1/me', { schema: z.object({ ok: z.boolean() }) });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer access-2');
  });

  describe('apiConditionalGet (spec 003 research R4)', () => {
    const schema = z.object({ v: z.number() });

    it('sends If-None-Match and returns the body with the new ETag', async () => {
      fetchMock.mockResolvedValue(withEtag(200, { v: 2 }, '"2"'));
      const result = await apiConditionalGet('/v1/x', schema, '"1"');
      expect(fetchMock.mock.calls[0][1].headers['If-None-Match']).toBe('"1"');
      expect(result).toEqual({ notModified: false, etag: '"2"', data: { v: 2 } });
    });

    it('reports notModified on 304 without throwing', async () => {
      fetchMock.mockResolvedValue(withEtag(304, null, '"1"'));
      await expect(apiConditionalGet('/v1/x', schema, '"1"')).resolves.toEqual({ notModified: true, etag: '"1"' });
    });

    it('sends no If-None-Match on the first load', async () => {
      fetchMock.mockResolvedValue(withEtag(200, { v: 1 }, '"1"'));
      await apiConditionalGet('/v1/x', schema, null);
      expect(fetchMock.mock.calls[0][1].headers['If-None-Match']).toBeUndefined();
    });
  });
});
