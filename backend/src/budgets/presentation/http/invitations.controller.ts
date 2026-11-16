import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type AcceptInvitationResponse,
  type CreatedInvitation,
  CreateInvitationRequest,
  type InvitationPreview,
  InvitationsQuery,
  type InvitationsResponse,
  PutPushDeviceRequest,
} from '@two-cents/shared/contracts';
import type { Response } from 'express';
import type { z } from 'zod';
import {
  type AuthContext,
  AuthGuard,
  CurrentAuth,
} from '../../../shared-kernel/presentation/auth.guard';
import {
  ZodBody,
  ZodQuery,
} from '../../../shared-kernel/presentation/zod-validation.pipe';
import {
  CreateInvitation,
  ListInvitations,
  ResendInvitation,
  RevokeInvitation,
} from '../../application/use-cases/invitations';
import {
  AcceptInvitation,
  DeclineInvitation,
  PreviewInvitation,
} from '../../application/use-cases/joining';
import {
  RegisterPushDevice,
  UnregisterPushDevice,
} from '../../application/use-cases/push-devices';
import {
  BudgetAccessGuard,
  BudgetId,
  RequirePermission,
} from './budget-access.guard';

/** US2/US4, owner and Admin side (contracts/rest-api.md "Invitations (owner/admin side)"). */
@Controller('budgets/:budgetId/invitations')
@UseGuards(AuthGuard, BudgetAccessGuard)
export class InvitationsController {
  constructor(
    private readonly createInvitation: CreateInvitation,
    private readonly listInvitations: ListInvitations,
    private readonly resendInvitation: ResendInvitation,
    private readonly revokeInvitation: RevokeInvitation,
  ) {}

  /** 201 for a new invitation, 200 when an existing one was resent (FR-014). */
  @Post()
  @RequirePermission('invitations.manage')
  async create(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodBody(CreateInvitationRequest)
    body: z.infer<typeof CreateInvitationRequest>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreatedInvitation> {
    const created = await this.createInvitation.execute(auth, budgetId, body);
    res.status(created.resent ? 200 : 201);
    return created;
  }

  @Get()
  @RequirePermission('invitations.manage')
  async list(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @ZodQuery(InvitationsQuery) query: z.infer<typeof InvitationsQuery>,
  ): Promise<InvitationsResponse> {
    return {
      invitations: await this.listInvitations.execute(
        auth,
        budgetId,
        query.status,
      ),
    };
  }

  @Post(':invitationId/resend')
  @HttpCode(200)
  @RequirePermission('invitations.manage')
  resend(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<CreatedInvitation> {
    return this.resendInvitation.execute(auth, budgetId, invitationId);
  }

  @Delete(':invitationId')
  @HttpCode(204)
  @RequirePermission('invitations.manage')
  async revoke(
    @CurrentAuth() auth: AuthContext,
    @BudgetId() budgetId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    await this.revokeInvitation.execute(auth, budgetId, invitationId);
  }
}

/**
 * US2, invitee side: not budget-scoped, since the caller isn't a member yet. Failed lookups are
 * limited per account by the use case (FR-022).
 */
@Controller('invitations/:code')
@UseGuards(AuthGuard)
export class InviteeInvitationsController {
  constructor(
    private readonly preview: PreviewInvitation,
    private readonly accept: AcceptInvitation,
    private readonly decline: DeclineInvitation,
  ) {}

  @Get()
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('code') code: string,
  ): Promise<InvitationPreview> {
    return this.preview.execute(auth, code);
  }

  @Post('accept')
  @HttpCode(200)
  acceptInvitation(
    @CurrentAuth() auth: AuthContext,
    @Param('code') code: string,
  ): Promise<AcceptInvitationResponse> {
    return this.accept.execute(auth, code);
  }

  @Post('decline')
  @HttpCode(204)
  async declineInvitation(
    @CurrentAuth() auth: AuthContext,
    @Param('code') code: string,
  ): Promise<void> {
    await this.decline.execute(auth, code);
  }
}

/** Push token of the current session (research R8). */
@Controller('me/push-devices')
@UseGuards(AuthGuard)
export class PushDevicesController {
  constructor(
    private readonly register: RegisterPushDevice,
    private readonly unregister: UnregisterPushDevice,
  ) {}

  @Put()
  @HttpCode(204)
  async put(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(PutPushDeviceRequest) body: z.infer<typeof PutPushDeviceRequest>,
  ): Promise<void> {
    await this.register.execute(auth, body);
  }

  @Delete('current')
  @HttpCode(204)
  async deleteCurrent(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.unregister.execute(auth);
  }
}
