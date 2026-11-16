import { Inject, Injectable } from '@nestjs/common';
import type { Me, UpdateProfileRequest } from '@two-cents/shared/contracts';
import { CLOCK, type Clock } from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/repositories';
import { toCurrencyCode } from '../../domain/value-objects/currency-code';
import { FirstName } from '../../domain/value-objects/first-name';
import { toLocale } from '../../domain/value-objects/locale';
import { MeView } from '../services/me-view';

/** US6: first name, avatar, color, language and preferred currency. */
@Injectable()
export class UpdateProfile {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly meView: MeView,
  ) {}

  async execute(userId: string, input: UpdateProfileRequest): Promise<Me> {
    const user = await this.users.findById(userId);
    if (!user) throw new DomainError('UNAUTHENTICATED');
    user.updateProfile(
      {
        firstName:
          input.firstName !== undefined
            ? FirstName.create(input.firstName)
            : undefined,
        avatarKey: input.avatarKey,
        colorKey: input.colorKey,
        locale: input.locale ? toLocale(input.locale) : undefined,
        currency: input.currency ? toCurrencyCode(input.currency) : undefined,
      },
      this.clock.now(),
    );
    await this.users.save(user);
    return this.meView.build(user);
  }
}
