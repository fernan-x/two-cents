import { z } from 'zod';

import { ApiError, apiRequest, setRefresher } from './api-client';
import { tokenStore } from './token-store';

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
});
