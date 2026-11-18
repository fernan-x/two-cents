import { Injectable } from '@nestjs/common';

export type ExportCell = string | number | boolean | null;

/** Extra export sections a later feature adds (spec 004 R15): rows per section, plus files. */
export interface ExportContribution {
  sections: Record<string, Array<Record<string, ExportCell>>>;
  files: Array<{ path: string; bytes: Uint8Array }>;
}

export interface BudgetExportContributor {
  /** One entry per budget the user currently belongs to. */
  contribute(
    memberships: ReadonlyArray<{
      budgetId: string;
      budgetName: string | null;
      membershipId: string;
    }>,
  ): Promise<ExportContribution>;
}

/**
 * Lets later features add their data to the GDPR export (Principle III) without this module
 * depending on them: spec 004's tracking module registers itself here at startup.
 */
@Injectable()
export class BudgetExportContributors {
  private readonly contributors: BudgetExportContributor[] = [];

  register(contributor: BudgetExportContributor): void {
    this.contributors.push(contributor);
  }

  async collect(
    memberships: Parameters<BudgetExportContributor['contribute']>[0],
  ): Promise<ExportContribution> {
    const out: ExportContribution = { sections: {}, files: [] };
    for (const c of this.contributors) {
      const part = await c.contribute(memberships);
      for (const [name, rows] of Object.entries(part.sections))
        out.sections[name] = [...(out.sections[name] ?? []), ...rows];
      out.files.push(...part.files);
    }
    return out;
  }
}
