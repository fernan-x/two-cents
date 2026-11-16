import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from '../../../shared-kernel/application/ports';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import {
  PUSH_DEVICE_REPOSITORY,
  type PushDeviceRepository,
} from '../../domain/ports/repositories';

/** Push token of the current session (research R8). It dies with the session. */
@Injectable()
export class RegisterPushDevice {
  constructor(
    @Inject(PUSH_DEVICE_REPOSITORY)
    private readonly devices: PushDeviceRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(
    auth: AuthContext,
    input: { expoPushToken: string; platform: 'ios' | 'android' },
  ): Promise<void> {
    return this.devices.upsertForSession({
      id: this.ids.next(),
      userId: auth.userId,
      sessionId: auth.sessionId,
      expoPushToken: input.expoPushToken,
      platform: input.platform,
      updatedAt: this.clock.now(),
    });
  }
}

@Injectable()
export class UnregisterPushDevice {
  constructor(
    @Inject(PUSH_DEVICE_REPOSITORY)
    private readonly devices: PushDeviceRepository,
  ) {}

  execute(auth: AuthContext): Promise<void> {
    return this.devices.deleteForSession(auth.sessionId);
  }
}
