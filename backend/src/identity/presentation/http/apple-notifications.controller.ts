import { Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodBody } from '../../../shared-kernel/presentation/zod-validation.pipe';
import { HandleAppleNotification } from '../../application/use-cases/handle-apple-notification';

const AppleNotificationBody = z.object({ payload: z.string().min(1) });

/** Endpoint registered in the Apple Developer portal for Sign in with Apple notifications. */
@Controller('auth/apple')
export class AppleNotificationsController {
  constructor(private readonly handle: HandleAppleNotification) {}

  @Post('notifications')
  @HttpCode(200)
  async notify(
    @ZodBody(AppleNotificationBody) body: z.infer<typeof AppleNotificationBody>,
  ): Promise<void> {
    await this.handle.execute(body.payload);
  }
}
