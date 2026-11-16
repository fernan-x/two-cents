import { DeletionPreviewResponse, DeletionScheduledResponse, Me, ReauthenticateResponse } from '@two-cents/shared/contracts';

import { apiRequest } from './api-client';

export const deletionApi = {
  preview: () => apiRequest('GET', '/v1/me/deletion/preview', { schema: DeletionPreviewResponse }),
  reauthenticate: (body: Record<string, unknown>) =>
    apiRequest('POST', '/v1/auth/reauthenticate', { body, schema: ReauthenticateResponse }),
  request: (reauthToken: string) =>
    apiRequest('DELETE', '/v1/me', { body: { reauthToken }, schema: DeletionScheduledResponse }),
  cancel: () => apiRequest('POST', '/v1/me/deletion/cancel', { schema: Me }),
  cancelByLink: (token: string) => apiRequest('POST', '/v1/me/deletion/cancel-by-link', { body: { token }, auth: false }),
};
