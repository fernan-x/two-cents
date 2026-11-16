import { AuthResult, type Locale } from '@two-cents/shared/contracts';

import { apiRequest } from './api-client';
import { currentDevice } from './device';

// Calls for the signed-out flows (contracts/api.md). All return an AuthResult on success.

export const authApi = {
  signUp: (input: { email: string; password: string; firstName: string; locale: Locale }) =>
    apiRequest('POST', '/v1/auth/signup', { body: { ...input, device: currentDevice() }, schema: AuthResult, auth: false }),

  login: (input: { email: string; password: string }) =>
    apiRequest('POST', '/v1/auth/login', { body: { ...input, device: currentDevice() }, schema: AuthResult, auth: false }),

  apple: (input: { identityToken: string; authorizationCode?: string; firstName?: string; locale: Locale }) =>
    apiRequest('POST', '/v1/auth/apple', { body: { ...input, device: currentDevice() }, schema: AuthResult, auth: false }),

  google: (input: { idToken: string; locale: Locale }) =>
    apiRequest('POST', '/v1/auth/google', { body: { ...input, device: currentDevice() }, schema: AuthResult, auth: false }),

  linkWithPassword: (input: { linkToken: string; password: string }) =>
    apiRequest('POST', '/v1/auth/link/password', { body: { ...input, device: currentDevice() }, schema: AuthResult, auth: false }),

  requestLinkEmail: (linkToken: string) =>
    apiRequest('POST', '/v1/auth/link/email', { body: { linkToken }, auth: false }),

  forgotPassword: (email: string, locale: Locale) =>
    apiRequest('POST', '/v1/auth/password/forgot', { body: { email, locale }, auth: false }),

  resetPassword: (token: string, newPassword: string) =>
    apiRequest('POST', '/v1/auth/password/reset', { body: { token, newPassword }, auth: false }),

  confirmLink: (token: string) =>
    apiRequest('POST', '/v1/auth/link/confirm', { body: { token, device: currentDevice() }, schema: AuthResult, auth: false }),
};
