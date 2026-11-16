import {
  AcceptInvitationResponse,
  BudgetDetail,
  CreatedInvitation,
  type CreateBudgetRequest,
  type CreateInvitationRequest,
  EventsResponse,
  InvitationPreview,
  InvitationsResponse,
  MembersResponse,
  MemberView,
  Money,
  MyBudgetsResponse,
  type UpdateBudgetRequest,
} from '@two-cents/shared/contracts';

import { apiRequest } from '@/auth/api-client';

const b = (id: string) => `/v1/budgets/${encodeURIComponent(id)}`;
const code = (c: string) => `/v1/invitations/${encodeURIComponent(c)}`;

/** Typed calls for spec 002 (contracts/rest-api.md); every response is parsed with its contract. */
export const budgetsApi = {
  mine: () => apiRequest('GET', '/v1/me/budgets', { schema: MyBudgetsResponse }),
  create: (body: CreateBudgetRequest) => apiRequest('POST', '/v1/budgets', { body, schema: BudgetDetail }),
  get: (id: string) => apiRequest('GET', b(id), { schema: BudgetDetail }),
  open: (id: string) => apiRequest('POST', `${b(id)}/open`),
  update: (id: string, body: UpdateBudgetRequest) => apiRequest('PATCH', b(id), { body, schema: BudgetDetail }),
  remove: (id: string, confirmName: string) => apiRequest('DELETE', b(id), { body: { confirmName } }),
  restore: (id: string) => apiRequest('POST', `${b(id)}/restore`, { schema: BudgetDetail }),

  members: (id: string) => apiRequest('GET', `${b(id)}/members`, { schema: MembersResponse }),
  changeRole: (id: string, membershipId: string, role: 'admin' | 'member' | 'viewer') =>
    apiRequest('PATCH', `${b(id)}/members/${membershipId}`, { body: { role }, schema: MemberView }),
  removeMember: (id: string, membershipId: string) => apiRequest('DELETE', `${b(id)}/members/${membershipId}`),
  transferOwnership: (id: string, toMembershipId: string) =>
    apiRequest('POST', `${b(id)}/ownership`, { body: { toMembershipId }, schema: BudgetDetail }),
  leave: (id: string) => apiRequest('POST', `${b(id)}/leave`),
  events: (id: string, cursor?: string) =>
    apiRequest('GET', `${b(id)}/events${cursor ? `?cursor=${cursor}` : ''}`, { schema: EventsResponse }),
  putIncome: (id: string, monthStart: string, amountMinor: string) =>
    apiRequest('PUT', `${b(id)}/members/me/income/${monthStart}`, { body: { amountMinor }, schema: Money }),

  createInvitation: (id: string, body: CreateInvitationRequest) =>
    apiRequest('POST', `${b(id)}/invitations`, { body, schema: CreatedInvitation }),
  invitations: (id: string, status: 'pending' | 'all' = 'pending') =>
    apiRequest('GET', `${b(id)}/invitations?status=${status}`, { schema: InvitationsResponse }),
  resendInvitation: (id: string, invitationId: string) =>
    apiRequest('POST', `${b(id)}/invitations/${invitationId}/resend`, { schema: CreatedInvitation }),
  revokeInvitation: (id: string, invitationId: string) => apiRequest('DELETE', `${b(id)}/invitations/${invitationId}`),

  previewInvitation: (c: string) => apiRequest('GET', code(c), { schema: InvitationPreview }),
  acceptInvitation: (c: string) => apiRequest('POST', `${code(c)}/accept`, { schema: AcceptInvitationResponse }),
  declineInvitation: (c: string) => apiRequest('POST', `${code(c)}/decline`),

  registerPushDevice: (expoPushToken: string, platform: 'ios' | 'android') =>
    apiRequest('PUT', '/v1/me/push-devices', { body: { expoPushToken, platform } }),
  unregisterPushDevice: () => apiRequest('DELETE', '/v1/me/push-devices/current'),
};
