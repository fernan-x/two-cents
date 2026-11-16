export type IdentityProvider = 'apple' | 'google';

export interface AuthIdentityProps {
  id: string;
  userId: string;
  provider: IdentityProvider;
  providerSubject: string;
  providerEmail: string | null;
  isPrivateRelay: boolean;
  appleRefreshTokenEnc: Buffer | null;
  createdAt: Date;
  lastUsedAt: Date;
}

/** An Apple or Google identity linked to a user, found by the provider's stable subject (FR-008). */
export class AuthIdentity {
  private constructor(private props: AuthIdentityProps) {}

  static link(input: {
    id: string;
    userId: string;
    provider: IdentityProvider;
    providerSubject: string;
    providerEmail: string | null;
    isPrivateRelay: boolean;
    appleRefreshTokenEnc: Buffer | null;
    now: Date;
  }): AuthIdentity {
    return new AuthIdentity({
      ...input,
      createdAt: input.now,
      lastUsedAt: input.now,
    });
  }

  static fromPersistence(props: AuthIdentityProps): AuthIdentity {
    return new AuthIdentity({ ...props });
  }

  toSnapshot(): Readonly<AuthIdentityProps> {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get provider(): IdentityProvider {
    return this.props.provider;
  }
  get appleRefreshTokenEnc(): Buffer | null {
    return this.props.appleRefreshTokenEnc;
  }

  /** Records a sign-in; Apple only sends the email on the first sign-in, so a missing email keeps the old one. */
  recordUse(email: string | null, isPrivateRelay: boolean, now: Date): void {
    if (email) {
      this.props.providerEmail = email;
      this.props.isPrivateRelay = isPrivateRelay;
    }
    this.props.lastUsedAt = now;
  }
}
