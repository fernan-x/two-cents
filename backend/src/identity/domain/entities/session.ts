import { isSessionActive } from '@two-cents/shared/domain';

export type AuthMethod = 'password' | 'apple' | 'google';
export type DevicePlatform = 'ios' | 'android' | 'web';
export type SessionRevokedReason =
  | 'logout'
  | 'revoked_by_user'
  | 'password_changed'
  | 'reuse_detected'
  | 'provider_revoked'
  | 'account_deletion';

export interface SessionProps {
  id: string;
  userId: string;
  authMethod: AuthMethod;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  deviceName: string;
  devicePlatform: DevicePlatform;
  createdAt: Date;
  lastUsedAt: Date;
  reauthTokenHash: string | null;
  reauthExpiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: SessionRevokedReason | null;
}

/** One signed-in device (data-model "sessions"). */
export class Session {
  private constructor(private props: SessionProps) {}

  static open(input: {
    id: string;
    userId: string;
    authMethod: AuthMethod;
    refreshTokenHash: string;
    device: { deviceName: string; platform: DevicePlatform };
    now: Date;
  }): Session {
    return new Session({
      id: input.id,
      userId: input.userId,
      authMethod: input.authMethod,
      refreshTokenHash: input.refreshTokenHash,
      previousRefreshTokenHash: null,
      deviceName: input.device.deviceName.trim().slice(0, 100),
      devicePlatform: input.device.platform,
      createdAt: input.now,
      lastUsedAt: input.now,
      reauthTokenHash: null,
      reauthExpiresAt: null,
      revokedAt: null,
      revokedReason: null,
    });
  }

  static fromPersistence(props: SessionProps): Session {
    return new Session({ ...props });
  }

  toSnapshot(): Readonly<SessionProps> {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get authMethod(): AuthMethod {
    return this.props.authMethod;
  }
  get revokedReason(): SessionRevokedReason | null {
    return this.props.revokedReason;
  }

  isActive(now: Date): boolean {
    return isSessionActive(this.props, now);
  }

  /** Idempotent: revoking an already revoked session keeps the first reason. */
  revoke(reason: SessionRevokedReason, now: Date): void {
    if (this.props.revokedAt) return;
    this.props.revokedAt = now;
    this.props.revokedReason = reason;
  }

  /**
   * Replaces the refresh token (research R5). Presenting the previous token again means it was stolen:
   * the caller must revoke the session with `reuse_detected`.
   */
  rotate(newRefreshTokenHash: string, now: Date): void {
    this.props.previousRefreshTokenHash = this.props.refreshTokenHash;
    this.props.refreshTokenHash = newRefreshTokenHash;
    this.props.lastUsedAt = now;
  }

  /** Stores a 5-minute single-use re-authentication token (US5, US8). */
  issueReauthToken(hash: string, now: Date): Date {
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
    this.props.reauthTokenHash = hash;
    this.props.reauthExpiresAt = expiresAt;
    return expiresAt;
  }

  /** True when the hash matches an unexpired re-authentication token; it can only be used once. */
  consumeReauthToken(hash: string, now: Date): boolean {
    const valid =
      this.props.reauthTokenHash !== null &&
      this.props.reauthTokenHash === hash &&
      this.props.reauthExpiresAt !== null &&
      this.props.reauthExpiresAt.getTime() > now.getTime();
    this.props.reauthTokenHash = null;
    this.props.reauthExpiresAt = null;
    return valid;
  }
}
