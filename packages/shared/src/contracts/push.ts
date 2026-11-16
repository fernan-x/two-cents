import { z } from 'zod';

export const PutPushDeviceRequest = z.object({
  expoPushToken: z.string().trim().min(1).max(255),
  platform: z.enum(['ios', 'android']),
});
export type PutPushDeviceRequest = z.infer<typeof PutPushDeviceRequest>;
