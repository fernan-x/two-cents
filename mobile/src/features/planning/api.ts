import {
  Category,
  type ChangeStatusRequest,
  type CreateCategoryRequest,
  type CreateIncomeRequest,
  type CreateLineRequest,
  type CreateMonthRequest,
  type CreateTemplateRequest,
  HistoryResponse,
  ImportCommitResponse,
  ImportPreviewResult,
  type ImportRequest,
  ListCategoriesResponse,
  ListMonthsResponse,
  ListTemplatesResponse,
  MonthDetail,
  type ReorderLinesRequest,
  TemplateSummary,
  type UpdateCategoryRequest,
  type UpdateIncomeRequest,
  type UpdateLineRequest,
} from '@two-cents/shared/contracts';

import { apiConditionalGet, apiRequest } from '@/auth/api-client';

const b = (id: string) => `/v1/budgets/${encodeURIComponent(id)}`;
const m = (id: string, start: string) => `${b(id)}/months/${encodeURIComponent(start)}`;

/** Typed calls for spec 003 (contracts/rest-api.md); every response is parsed with its contract. */
export const planningApi = {
  // Months
  months: (id: string, cursor?: string) =>
    apiRequest('GET', `${b(id)}/months${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
      schema: ListMonthsResponse,
    }),
  createMonth: (id: string, body: CreateMonthRequest) =>
    apiRequest('POST', `${b(id)}/months`, { body, schema: MonthDetail }),
  /** Conditional GET on the month revision (research R4). */
  month: (id: string, start: string, etag: string | null) => apiConditionalGet(m(id, start), MonthDetail, etag),
  changeStatus: (id: string, start: string, body: ChangeStatusRequest) =>
    apiRequest('POST', `${m(id, start)}/status`, { body, schema: MonthDetail }),
  history: (id: string, start: string, options: { cursor?: string; all?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (options.cursor) query.set('cursor', options.cursor);
    if (options.all) query.set('all', 'true');
    const qs = query.toString();
    return apiRequest('GET', `${m(id, start)}/history${qs ? `?${qs}` : ''}`, { schema: HistoryResponse });
  },

  // Lines
  createLine: (id: string, start: string, body: CreateLineRequest) =>
    apiRequest('POST', `${m(id, start)}/lines`, { body, schema: MonthDetail }),
  updateLine: (id: string, start: string, lineId: string, body: UpdateLineRequest) =>
    apiRequest('PATCH', `${m(id, start)}/lines/${lineId}`, { body, schema: MonthDetail }),
  deleteLine: (id: string, start: string, lineId: string, expectedVersion: number) =>
    apiRequest('DELETE', `${m(id, start)}/lines/${lineId}?expectedVersion=${expectedVersion}`, { schema: MonthDetail }),
  reorderLines: (id: string, start: string, body: ReorderLinesRequest) =>
    apiRequest('PUT', `${m(id, start)}/lines/order`, { body, schema: MonthDetail }),

  // Incomes
  createIncome: (id: string, start: string, body: CreateIncomeRequest) =>
    apiRequest('POST', `${m(id, start)}/incomes`, { body, schema: MonthDetail }),
  updateIncome: (id: string, start: string, incomeId: string, body: UpdateIncomeRequest) =>
    apiRequest('PATCH', `${m(id, start)}/incomes/${incomeId}`, { body, schema: MonthDetail }),
  deleteIncome: (id: string, start: string, incomeId: string, expectedVersion: number) =>
    apiRequest('DELETE', `${m(id, start)}/incomes/${incomeId}?expectedVersion=${expectedVersion}`, {
      schema: MonthDetail,
    }),
  confirmIncomes: (id: string, start: string) =>
    apiRequest('POST', `${m(id, start)}/incomes/confirm`, { schema: MonthDetail }),

  // Categories
  categories: (id: string) => apiRequest('GET', `${b(id)}/categories`, { schema: ListCategoriesResponse }),
  createCategory: (id: string, body: CreateCategoryRequest) =>
    apiRequest('POST', `${b(id)}/categories`, { body, schema: Category }),
  updateCategory: (id: string, categoryId: string, body: UpdateCategoryRequest) =>
    apiRequest('PATCH', `${b(id)}/categories/${categoryId}`, { body, schema: Category }),
  deleteCategory: (id: string, categoryId: string) => apiRequest('DELETE', `${b(id)}/categories/${categoryId}`),

  // Templates
  templates: (id: string) => apiRequest('GET', `${b(id)}/templates`, { schema: ListTemplatesResponse }),
  createTemplate: (id: string, body: CreateTemplateRequest) =>
    apiRequest('POST', `${b(id)}/templates`, { body, schema: TemplateSummary }),
  renameTemplate: (id: string, templateId: string, name: string) =>
    apiRequest('PATCH', `${b(id)}/templates/${templateId}`, { body: { name }, schema: TemplateSummary }),
  deleteTemplate: (id: string, templateId: string) => apiRequest('DELETE', `${b(id)}/templates/${templateId}`),

  // Import (research R16)
  importPreview: (id: string, body: Omit<ImportRequest, 'dryRun'>) =>
    apiRequest('POST', `${b(id)}/imports`, { body: { ...body, dryRun: true }, schema: ImportPreviewResult }),
  importCommit: (id: string, body: Omit<ImportRequest, 'dryRun'>) =>
    apiRequest('POST', `${b(id)}/imports`, { body: { ...body, dryRun: false }, schema: ImportCommitResponse }),
};
