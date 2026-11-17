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
  // Spec 003, US1
  'POST /v1/budgets/:budgetId/months': {
    viewer: 'forbidden',
    body: { periodStart: '2026-11-01', source: { kind: 'scratch' } },
  },
  'GET /v1/budgets/:budgetId/months/:monthStart': {
    viewer: 'allowed',
    params: { monthStart: '2026-11-01' },
  },
  'POST /v1/budgets/:budgetId/months/:monthStart/lines': {
    viewer: 'forbidden',
    params: { monthStart: '2026-11-01' },
    body: {
      group: 'one_off_shared',
      label: 'Ponceuse',
      amount: { entry: 'total', totalMinor: '4000' },
      split: { mode: 'equal' },
    },
  },
  'PATCH /v1/budgets/:budgetId/months/:monthStart/lines/:lineId': {
    viewer: 'forbidden',
    params: { monthStart: '2026-11-01', lineId: ID },
    body: { expectedVersion: 1, label: 'x' },
  },
  'DELETE /v1/budgets/:budgetId/months/:monthStart/lines/:lineId': {
    viewer: 'forbidden',
    params: { monthStart: '2026-11-01', lineId: ID },
  },
  'PUT /v1/budgets/:budgetId/months/:monthStart/lines/order': {
    viewer: 'forbidden',
    params: { monthStart: '2026-11-01' },
    body: { group: 'recurring_shared', lineIds: [] },
  },
  'POST /v1/budgets/:budgetId/months/:monthStart/incomes': {
    viewer: 'forbidden',
    params: { monthStart: '2026-11-01' },
    body: { amountMinor: '100' },
  },
  'PATCH /v1/budgets/:budgetId/months/:monthStart/incomes/:incomeId': {
    viewer: 'forbidden',
    params: { monthStart: '2026-11-01', incomeId: ID },
    body: { expectedVersion: 1, amountMinor: '1' },
  },
  'DELETE /v1/budgets/:budgetId/months/:monthStart/incomes/:incomeId': {
    viewer: 'forbidden',
    params: { monthStart: '2026-11-01', incomeId: ID },
  },
  // Spec 003, US2
  'POST /v1/budgets/:budgetId/months/:monthStart/incomes/confirm': {
    viewer: 'forbidden',
    params: { monthStart: '2026-11-01' },
  },
  'GET /v1/budgets/:budgetId/templates': { viewer: 'allowed' },
  'POST /v1/budgets/:budgetId/templates': {
    viewer: 'forbidden',
    body: { name: 'Mois type', fromMonthStart: '2026-11-01' },
  },
  'PATCH /v1/budgets/:budgetId/templates/:templateId': {
    viewer: 'forbidden',
    params: { templateId: ID },
    body: { name: 'Autre' },
  },
  'DELETE /v1/budgets/:budgetId/templates/:templateId': {
    viewer: 'forbidden',
    params: { templateId: ID },
  },
  // Spec 003, US3
  'GET /v1/budgets/:budgetId/categories': { viewer: 'allowed' },
  'POST /v1/budgets/:budgetId/categories': {
    viewer: 'forbidden',
    body: { name: 'Bricolage' },
  },
  'PATCH /v1/budgets/:budgetId/categories/:categoryId': {
    viewer: 'forbidden',
    params: { categoryId: ID },
    body: { name: 'Autre nom' },
  },
  'DELETE /v1/budgets/:budgetId/categories/:categoryId': {
    viewer: 'forbidden',
    params: { categoryId: ID },
  },
  // Spec 003, US5
  'POST /v1/budgets/:budgetId/months/:monthStart/status': {
    viewer: 'forbidden',
    params: { monthStart: '2026-11-01' },
    body: { action: 'activate' },
  },
  'GET /v1/budgets/:budgetId/months/:monthStart/history': {
    viewer: 'allowed',
    params: { monthStart: '2026-11-01' },
  },
  // Spec 003, US7
  'GET /v1/budgets/:budgetId/months': { viewer: 'allowed' },
  // Spec 003, US8
  'POST /v1/budgets/:budgetId/imports': {
    viewer: 'forbidden',
    body: {
      dryRun: true,
      months: [{ periodStart: '2026-10-01', incomes: [], lines: [] }],
    },
  },
};
