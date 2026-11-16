import { z } from 'zod';
import { BudgetMonth, Role } from './budgets';
import { AssignableRole } from './members';

export const InvitationKind = z.enum(['email', 'code']);
export const InvitationStatus = z.enum(['pending', 'accepted', 'declined', 'revoked', 'expired']);
export type InvitationStatus = z.infer<typeof InvitationStatus>;

export const CreateInvitationRequest = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('email'),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    role: AssignableRole.default('member'),
  }),
  z.object({ kind: z.literal('code'), role: AssignableRole.default('member') }),
]);
export type CreateInvitationRequest = z.input<typeof CreateInvitationRequest>;

export const InvitationView = z.object({
  id: z.uuid(),
  kind: InvitationKind,
  email: z.string().nullable(),
  role: AssignableRole,
  status: InvitationStatus,
  invitedBy: z.string(),
  lastSentAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type InvitationView = z.infer<typeof InvitationView>;

/** `code` (formatted `ABC-123`) and `link` are shown once, at creation or resend. */
export const CreatedInvitation = InvitationView.extend({
  code: z.string(),
  link: z.string(),
  /** True when an existing pending email invitation was resent instead (FR-014). */
  resent: z.boolean(),
});
export type CreatedInvitation = z.infer<typeof CreatedInvitation>;

export const InvitationsQuery = z.object({ status: z.enum(['pending', 'all']).default('pending') });
export const InvitationsResponse = z.object({ invitations: z.array(InvitationView) });
export type InvitationsResponse = z.infer<typeof InvitationsResponse>;

export const InvitationPreview = z.object({
  budgetName: z.string(),
  inviterName: z.string(),
  role: Role,
  expiresAt: z.iso.datetime(),
  memberCount: z.number().int().nonnegative(),
});
export type InvitationPreview = z.infer<typeof InvitationPreview>;

export const AcceptInvitationResponse = z.object({
  budgetId: z.uuid(),
  role: Role,
  /** False for viewers: they don't contribute (US7 scenario 3). */
  askIncome: z.boolean(),
  currentMonth: BudgetMonth,
});
export type AcceptInvitationResponse = z.infer<typeof AcceptInvitationResponse>;
