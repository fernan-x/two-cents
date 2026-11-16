import { Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { type Me, UpdateProfileRequest } from '@two-cents/shared/contracts';
import type { z } from 'zod';
import { ZodBody } from '../../../shared-kernel/presentation/zod-validation.pipe';
import { UpdateProfile } from '../../application/use-cases/update-profile';
import {
  AllowPendingDeletion,
  type AuthContext,
  AuthGuard,
  CurrentAuth,
} from '../../../shared-kernel/presentation/auth.guard';
import { GetMe } from '../../application/use-cases/sessions';

/** The signed-in user's own account (contracts/api.md "Profile, sessions, export, deletion"). */
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    private readonly getMe: GetMe,
    private readonly updateProfile: UpdateProfile,
  ) {}

  @Patch()
  update(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(UpdateProfileRequest) body: z.infer<typeof UpdateProfileRequest>,
  ): Promise<Me> {
    return this.updateProfile.execute(auth.userId, body);
  }

  @Get()
  @AllowPendingDeletion()
  me(@CurrentAuth() auth: AuthContext): Promise<Me> {
    return this.getMe.execute(auth.userId);
  }
}
