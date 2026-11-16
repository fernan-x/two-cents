import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { inArray } from 'drizzle-orm';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import type { PushMessage, PushSender } from '../../application/ports';
import { ENV, type Env } from '../config/env';
import type { Database } from '../db/database';
import { pushDevices } from '../db/schema';

/**
 * Sends pushes through the Expo Push Service (spec 002 research R8). Best effort: errors are logged
 * without tokens or content, and tokens Expo reports as unregistered are forgotten.
 */
@Injectable()
export class ExpoPushSender implements PushSender {
  private readonly logger = new Logger(ExpoPushSender.name);
  private readonly expo: Expo;

  constructor(
    @Inject(ENV) env: Env,
    @InjectDrizzle() private readonly db: Database,
  ) {
    this.expo = new Expo(
      env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : {},
    );
  }

  async send(messages: PushMessage[]): Promise<void> {
    // One Expo message per token, so each ticket maps back to its token.
    const expoMessages: ExpoPushMessage[] = messages.flatMap((m) =>
      m.to
        .filter((token) => Expo.isExpoPushToken(token))
        .map((token) => ({
          to: token,
          title: m.title,
          body: m.body,
          data: m.data,
          sound: 'default' as const,
        })),
    );
    const unregistered: string[] = [];
    for (const chunk of this.expo.chunkPushNotifications(expoMessages)) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, i) => {
          if (ticket.status === 'ok') return;
          if (ticket.details?.error === 'DeviceNotRegistered')
            unregistered.push(chunk[i].to as string);
          else
            this.logger.warn({ error: ticket.details?.error }, 'push refused');
        });
      } catch (error) {
        this.logger.warn(
          { err: (error as Error).message },
          'push chunk failed',
        );
      }
    }
    if (unregistered.length > 0)
      await this.db
        .delete(pushDevices)
        .where(inArray(pushDevices.expoPushToken, unregistered));
  }
}
