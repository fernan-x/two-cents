import { z } from 'zod';
import { AmountMinor, LocalDate, TrimmedText } from './budgets';
import { Formula, Group, Kind, ShareInput, SplitMode } from './lines';

/** Spec 003: month templates (research R15). */

export const TemplateName = TrimmedText(1, 60);

/** One line as stored in `month_template.lines` (jsonb). */
export const TemplateLine = z.object({
  group: Group,
  kind: Kind,
  label: z.string(),
  categoryId: z.uuid().nullable(),
  isEnvelope: z.boolean(),
  subItems: z.array(z.object({ label: z.string(), amountMinor: AmountMinor.nullable() })),
  ownerMembershipId: z.uuid().nullable(),
  isPrivate: z.boolean(),
  splitMode: SplitMode.nullable(),
  payerMembershipId: z.uuid().nullable(),
  totalMinor: AmountMinor,
  shares: z.array(ShareInput),
  formula: Formula.nullable(),
  position: z.number().int(),
});
export type TemplateLine = z.infer<typeof TemplateLine>;

export const TemplateSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  lineCount: z.number().int(),
  updatedAt: z.iso.datetime(),
});
export type TemplateSummary = z.infer<typeof TemplateSummary>;

export const ListTemplatesResponse = z.object({ templates: z.array(TemplateSummary) });
export type ListTemplatesResponse = z.infer<typeof ListTemplatesResponse>;

export const CreateTemplateRequest = z.object({ name: TemplateName, fromMonthStart: LocalDate });
export type CreateTemplateRequest = z.input<typeof CreateTemplateRequest>;

export const RenameTemplateRequest = z.object({ name: TemplateName });
export type RenameTemplateRequest = z.input<typeof RenameTemplateRequest>;
