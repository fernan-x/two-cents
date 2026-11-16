/**
 * Every `/v1/budgets/:budgetId/...` route and how a viewer is treated (SC-002, FR-041). The
 * coverage suite fails when a route is missing here, so a new route can't ship untested.
 * `viewer: 'forbidden'` = a write (or owner/admin-only read) a viewer must get 403 on.
 */
export interface BudgetRouteCase {
  viewer: 'allowed' | 'forbidden';
  body?: object;
  /** Values for the other path params. */
  params?: Record<string, string>;
  /** Deleted budgets answer 404 on every route except restore, which has its own rule. */
  special?: 'restore';
}

const ID = '00000000-0000-7000-8000-000000000001';

export const BUDGET_ROUTE_CASES: Record<string, BudgetRouteCase> = {
  'GET /v1/budgets/:budgetId': { viewer: 'allowed' },
  'POST /v1/budgets/:budgetId/open': { viewer: 'allowed' },
  'PATCH /v1/budgets/:budgetId': {
    viewer: 'forbidden',
    body: { name: 'Nouveau nom' },
  },
  'DELETE /v1/budgets/:budgetId': {
    viewer: 'forbidden',
    body: { confirmName: 'x' },
  },
  'POST /v1/budgets/:budgetId/restore': {
    viewer: 'forbidden',
    special: 'restore',
  },
  'GET /v1/budgets/:budgetId/members': { viewer: 'allowed' },
  'PUT /v1/budgets/:budgetId/members/me/income/:monthStart': {
    viewer: 'forbidden',
    params: { monthStart: '2026-11-01' },
    body: { amountMinor: '100' },
  },
  'PATCH /v1/budgets/:budgetId/members/:membershipId': {
    viewer: 'forbidden',
    params: { membershipId: ID },
    body: { role: 'member' },
  },
  'DELETE /v1/budgets/:budgetId/members/:membershipId': {
    viewer: 'forbidden',
    params: { membershipId: ID },
  },
  'POST /v1/budgets/:budgetId/ownership': {
    viewer: 'forbidden',
    body: { toMembershipId: ID },
  },
  'POST /v1/budgets/:budgetId/leave': { viewer: 'allowed' },
  'GET /v1/budgets/:budgetId/events': { viewer: 'forbidden' },
  'POST /v1/budgets/:budgetId/invitations': {
    viewer: 'forbidden',
    body: { kind: 'code' },
  },
  'GET /v1/budgets/:budgetId/invitations': { viewer: 'forbidden' },
  'POST /v1/budgets/:budgetId/invitations/:invitationId/resend': {
    viewer: 'forbidden',
    params: { invitationId: ID },
  },
  'DELETE /v1/budgets/:budgetId/invitations/:invitationId': {
    viewer: 'forbidden',
    params: { invitationId: ID },
  },
};
