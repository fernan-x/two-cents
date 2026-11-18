import type { CsvMapping } from '@two-cents/shared/contracts';

import type { ReviewRow } from './import-model';

/** The import in progress, shared by the two import screens (kept in memory only). */
export const csvImportStore: {
  account: 'joint' | 'member';
  rows: string[][];
  mapping: CsvMapping | null;
  review: ReviewRow[];
} = { account: 'joint', rows: [], mapping: null, review: [] };
