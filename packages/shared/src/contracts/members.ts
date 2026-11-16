import { z } from 'zod';
import { MemberView, PersonRef } from './budgets';

export const AssignableRole = z.enum(['admin', 'member', 'viewer']);
export type AssignableRole = z.infer<typeof AssignableRole>;

export const MembersResponse = z.object({
  members: z.array(MemberView),
  formerMembers: z.array(PersonRef),
});
export type MembersResponse = z.infer<typeof MembersResponse>;

export const ChangeRoleRequest = z.object({ role: AssignableRole });
export type ChangeRoleRequest = z.infer<typeof ChangeRoleRequest>;

export const TransferOwnershipRequest = z.object({ toMembershipId: z.uuid() });
export type TransferOwnershipRequest = z.infer<typeof TransferOwnershipRequest>;

export const MembershipEventType = z.enum([
  'budget_created',
  'joined',
  'role_changed',
  'ownership_transferred',
  'removed',
  'left',
  'invitation_sent',
  'invitation_revoked',
  'settings_changed',
  'budget_deleted',
  'budget_restored',
]);
export type MembershipEventType = z.infer<typeof MembershipEventType>;

/** Audit entry (FR-034). `details` never holds amounts or emails. */
export const MembershipEvent = z.object({
  id: z.uuid(),
  type: MembershipEventType,
  actorName: z.string().nullable(),
  targetName: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type MembershipEvent = z.infer<typeof MembershipEvent>;

export const EventsQuery = z.object({ cursor: z.uuid().optional() });
export const EventsResponse = z.object({
  events: z.array(MembershipEvent),
  nextCursor: z.uuid().nullable(),
});
export type EventsResponse = z.infer<typeof EventsResponse>;
