import { createHmac, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { inArray, eq } from 'drizzle-orm';
import type { AvatarKey, ColorKey, Locale } from '@two-cents/shared/contracts';
import { generateInviteCode } from '@two-cents/shared/domain';
import { ENV, type Env } from '../../shared-kernel/infrastructure/config/env';
import { DrizzleTransactionRunner } from '../../shared-kernel/infrastructure/db/drizzle-transaction-runner';
import { users } from '../../shared-kernel/infrastructure/db/schema';
import type {
  InvitationLinks,
  InviteCodes,
  UserDirectory,
  UserInfo,
} from '../application/ports';

/** Codes from `crypto.randomInt`; only `HMAC-SHA256(code, INVITE_CODE_SECRET)` is stored (R6). */
@Injectable()
export class HmacInviteCodes implements InviteCodes {
  constructor(@Inject(ENV) private readonly env: Env) {}

  generate(): string {
    return generateInviteCode((max) => randomInt(max));
  }

  hash(code: string): string {
    return createHmac('sha256', this.env.INVITE_CODE_SECRET)
      .update(code)
      .digest('hex');
  }
}

/** `https://<app-domain>/i/<CODE>` (contracts/links-and-notifications.md). */
@Injectable()
export class AppInvitationLinks implements InvitationLinks {
  constructor(@Inject(ENV) private readonly env: Env) {}

  forCode(code: string): string {
    const base = this.env.APP_LINK_BASE_URL.replace(/\/+$/, '');
    const separator = base.endsWith(':') ? '//' : '/';
    return `${base}${base.endsWith('//') ? '' : separator}i/${encodeURIComponent(code)}`;
  }
}

type UserRow = Pick<
  typeof users.$inferSelect,
  | 'id'
  | 'firstName'
  | 'emailNormalized'
  | 'emailConfirmedAt'
  | 'avatarKey'
  | 'colorKey'
  | 'locale'
>;

const toInfo = (row: UserRow): UserInfo => ({
  id: row.id,
  firstName: row.firstName,
  emailNormalized: row.emailNormalized,
  emailConfirmed: row.emailConfirmedAt !== null,
  avatarKey: row.avatarKey as AvatarKey,
  colorKey: row.colorKey as ColorKey,
  locale: row.locale as Locale,
});

/** Read-only view of spec 001's users. */
@Injectable()
export class DrizzleUserDirectory implements UserDirectory {
  constructor(private readonly db: DrizzleTransactionRunner) {}

  private readonly columns = {
    id: users.id,
    firstName: users.firstName,
    emailNormalized: users.emailNormalized,
    emailConfirmedAt: users.emailConfirmedAt,
    avatarKey: users.avatarKey,
    colorKey: users.colorKey,
    locale: users.locale,
  };

  async findByIds(ids: readonly string[]): Promise<Map<string, UserInfo>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .executor()
      .select(this.columns)
      .from(users)
      .where(inArray(users.id, [...new Set(ids)]));
    return new Map(rows.map((r) => [r.id, toInfo(r)]));
  }

  async findByEmail(emailNormalized: string): Promise<UserInfo | null> {
    const [row] = await this.db
      .executor()
      .select(this.columns)
      .from(users)
      .where(eq(users.emailNormalized, emailNormalized))
      .limit(1);
    return row ? toInfo(row) : null;
  }
}
