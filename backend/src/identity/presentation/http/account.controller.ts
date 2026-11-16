import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CancelDeletionByLinkRequest,
  type DeletionPreviewResponse,
  DeletionRequest,
  type Me,
} from '@two-cents/shared/contracts';
import type { Response } from 'express';
import type { z } from 'zod';
import { AuthThrottle } from '../../../shared-kernel/presentation/auth-throttle.decorator';
import {
  AllowPendingDeletion,
  type AuthContext,
  AuthGuard,
  CurrentAuth,
} from '../../../shared-kernel/presentation/auth.guard';
import { UserThrottlerGuard } from '../../../shared-kernel/presentation/user-throttler.guard';
import { ZodBody } from '../../../shared-kernel/presentation/zod-validation.pipe';
import {
  CancelDeletion,
  CancelDeletionByLink,
  PreviewDeletion,
  RequestDeletion,
} from '../../application/use-cases/account-deletion';
import { ExportData } from '../../application/use-cases/export-data';

/** US8: data export and account deletion (contracts/api.md). */
@Controller('me')
export class AccountController {
  constructor(
    private readonly exportData: ExportData,
    private readonly previewDeletion: PreviewDeletion,
    private readonly requestDeletion: RequestDeletion,
    private readonly cancelDeletion: CancelDeletion,
    private readonly cancelByLink: CancelDeletionByLink,
  ) {}

  @Get('export')
  @UseGuards(AuthGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  async export(
    @CurrentAuth() auth: AuthContext,
    @Res() res: Response,
  ): Promise<void> {
    const zip = await this.exportData.execute(auth.userId);
    const date = new Date().toISOString().slice(0, 10);
    res
      .status(200)
      .set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="two-cents-export-${date}.zip"`,
        'Cache-Control': 'no-store',
      })
      .send(Buffer.from(zip));
  }

  @Get('deletion/preview')
  @UseGuards(AuthGuard)
  preview(@CurrentAuth() auth: AuthContext): Promise<DeletionPreviewResponse> {
    return this.previewDeletion.execute(auth.userId);
  }

  @Delete()
  @HttpCode(202)
  @UseGuards(AuthGuard)
  delete(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(DeletionRequest.partial())
    body: Partial<z.infer<typeof DeletionRequest>>,
  ): Promise<{ deletionScheduledAt: string }> {
    return this.requestDeletion.execute(auth, body.reauthToken);
  }

  @Post('deletion/cancel')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @AllowPendingDeletion()
  cancel(@CurrentAuth() auth: AuthContext): Promise<Me> {
    return this.cancelDeletion.execute(auth.userId);
  }

  @Post('deletion/cancel-by-link')
  @HttpCode(204)
  @AuthThrottle()
  async cancelWithLink(
    @ZodBody(CancelDeletionByLinkRequest)
    body: z.infer<typeof CancelDeletionByLinkRequest>,
  ): Promise<void> {
    await this.cancelByLink.execute(body.token);
  }
}
