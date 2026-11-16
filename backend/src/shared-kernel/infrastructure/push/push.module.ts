import { Global, Module } from '@nestjs/common';
import { PUSH_SENDER } from '../../application/ports';
import { ExpoPushSender } from './expo-push-sender';

/** Push notifications for every context. Tests override PUSH_SENDER with an in-memory sender. */
@Global()
@Module({
  providers: [
    ExpoPushSender,
    { provide: PUSH_SENDER, useExisting: ExpoPushSender },
  ],
  exports: [PUSH_SENDER],
})
export class PushModule {}
