import { Me } from '@two-cents/shared/contracts';
import { z } from 'zod';

import { apiRequest } from './api-client';

// Calls for a signed-in user's own account (contracts/api.md).
export const accountApi = {
  me: () => apiRequest('GET', '/v1/me', { schema: Me }),
  confirmEmail: (token: string) =>
    apiRequest('POST', '/v1/auth/email/confirm', { body: { token }, schema: z.object({ me: Me }), auth: false }),
  resendConfirmation: () => apiRequest('POST', '/v1/auth/email/resend-confirmation'),
};
