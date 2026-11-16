import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../shared-kernel/infrastructure/config/env';
import type { LinkBuilder } from '../application/ports/mailer';

/** Email links (contracts/deep-links.md). Tokens are only ever in the query string of these links. */
@Injectable()
export class AppLinkBuilder implements LinkBuilder {
  constructor(@Inject(ENV) private readonly env: Env) {}

  build(
    path: 'confirm' | 'reset' | 'link' | 'cancel-deletion',
    token: string,
  ): string {
    const base = this.env.APP_LINK_BASE_URL.replace(/\/+$/, '');
    const separator = base.endsWith(':') ? '//' : '/';
    return `${base}${base.endsWith('//') ? '' : separator}l/${path}?t=${encodeURIComponent(token)}`;
  }
}
