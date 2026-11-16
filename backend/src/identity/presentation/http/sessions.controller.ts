import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { SessionsResponse } from '@two-cents/shared/contracts';
import {
  type AuthContext,
  AuthGuard,
  CurrentAuth,
} from '../../../shared-kernel/presentation/auth.guard';
import {
  ListSessions,
  RevokeOtherSessions,
  RevokeSession,
} from '../../application/use-cases/manage-sessions';

/** US7: the caller's signed-in devices. */
@Controller('me/sessions')
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(
    private readonly listSessions: ListSessions,
    private readonly revokeSession: RevokeSession,
    private readonly revokeOthers: RevokeOtherSessions,
  ) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext): Promise<SessionsResponse> {
    return this.listSessions.execute(auth);
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.revokeSession.execute(auth, id);
  }

  @Post('revoke-others')
  @HttpCode(200)
  revokeAllOthers(
    @CurrentAuth() auth: AuthContext,
  ): Promise<{ revokedCount: number }> {
    return this.revokeOthers.execute(auth);
  }
}
