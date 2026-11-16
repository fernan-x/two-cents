import { z } from 'zod';
import { AvatarKey, ColorKey, CurrencyCode, Locale, Platform } from './common';

export const UpdateProfileRequest = z
  .object({
    firstName: z.string().max(200),
    avatarKey: AvatarKey,
    colorKey: ColorKey,
    locale: Locale,
    currency: CurrencyCode,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field');
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;

export const SessionSummary = z.object({
  id: z.uuid(),
  deviceName: z.string(),
  platform: Platform,
  signedInAt: z.iso.datetime(),
  lastActiveAt: z.iso.datetime(),
  current: z.boolean(),
});
export const SessionsResponse = z.object({ sessions: z.array(SessionSummary) });
export type SessionsResponse = z.infer<typeof SessionsResponse>;
export const RevokeOthersResponse = z.object({ revokedCount: z.number().int().nonnegative() });

export const DeletionPreviewResponse = z.object({
  budgetsDeleted: z.array(z.object({ id: z.string(), name: z.string() })),
  budgetsLeft: z.array(z.object({ id: z.string(), name: z.string(), newOwnerFirstName: z.string().optional() })),
  scheduledAt: z.iso.datetime(),
});
export type DeletionPreviewResponse = z.infer<typeof DeletionPreviewResponse>;
export const DeletionRequest = z.object({ reauthToken: z.string().min(1) });
export const DeletionScheduledResponse = z.object({ deletionScheduledAt: z.iso.datetime() });
export const CancelDeletionByLinkRequest = z.object({ token: z.string().min(1) });
