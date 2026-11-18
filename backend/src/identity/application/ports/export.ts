export type ExportRow = Record<string, string | number | boolean | null>;

/** Everything a user can export (FR-040). Never contains secrets: no hashes, tokens or encrypted values. */
export interface UserExport {
  exportedAt: string;
  profile: ExportRow;
  signInMethods: ExportRow[];
  sessions: ExportRow[];
  budgets: ExportRow[];
  entries: ExportRow[];
  /** Spec 004 sections (transactions, settlements, recurring rules). */
  sections?: Record<string, ExportRow[]>;
  /** Spec 004 receipt photos; written as files, never into export.json. */
  files?: Array<{ path: string; bytes: Uint8Array }>;
}

export interface ExportArchiveBuilder {
  /** A ZIP with export.json and one CSV per section. */
  build(data: UserExport): Uint8Array;
}
export const EXPORT_ARCHIVE_BUILDER = Symbol('ExportArchiveBuilder');
