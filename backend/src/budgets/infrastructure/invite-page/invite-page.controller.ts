import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  formatInviteCode,
  normalizeInviteCode,
} from '@two-cents/shared/domain';
import {
  ENV,
  type Env,
} from '../../../shared-kernel/infrastructure/config/env';
import { renderInvitePage } from './render-invite-page';

/**
 * FR-016: the public page behind `https://<app-domain>/i/<CODE>` when the app isn't installed. It
 * never reads the database: store buttons and the code, no budget or inviter data (Principle III).
 * Served outside `/v1`; 30 requests per hour per IP.
 */
@Controller('i')
export class InvitePageController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get(':code')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Robots-Tag', 'noindex')
  page(@Param('code') code: string): string {
    const normalized = normalizeInviteCode(code);
    return renderInvitePage({
      code: normalized ? formatInviteCode(normalized) : null,
      appStoreUrl: this.env.APP_STORE_URL,
      playStoreUrl: this.env.PLAY_STORE_URL,
    });
  }
}
