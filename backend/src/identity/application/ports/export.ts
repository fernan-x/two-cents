export type ExportRow = Record<string, string | number | boolean | null>;

/** Everything a user can export (FR-040). Never contains secrets: no hashes, tokens or encrypted values. */
export interface UserExport {
  exportedAt: string;
  profile: ExportRow;
  signInMethods: ExportRow[];
  sessions: ExportRow[];
  budgets: ExportRow[];
  entries: ExportRow[];
}

export interface ExportArchiveBuilder {
  /** A ZIP with export.json and one CSV per section. */
  build(data: UserExport): Uint8Array;
}
export const EXPORT_ARCHIVE_BUILDER = Symbol('ExportArchiveBuilder');
