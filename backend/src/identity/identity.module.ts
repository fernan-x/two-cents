import { Global, Module, type Provider } from '@nestjs/common';
import { AppleNotificationsController } from './presentation/http/apple-notifications.controller';
import { AuthController } from './presentation/http/auth.controller';
import { MeController } from './presentation/http/me.controller';
import {
  GetMe,
  LogIn,
  LogOut,
  RefreshSession,
} from './application/use-cases/sessions';
import {
  ConfirmEmail,
  ResendConfirmation,
} from './application/use-cases/email-confirmation';
import {
  CompletePasswordReset,
  RequestPasswordReset,
} from './application/use-cases/password-reset';
import {
  Reauthenticate,
  ReauthTokenChecker,
} from './application/use-cases/reauthenticate';
import { UpdateProfile } from './application/use-cases/update-profile';
import {
  CancelDeletion,
  CancelDeletionByLink,
  FinalizeDeletion,
  PreviewDeletion,
  RequestDeletion,
} from './application/use-cases/account-deletion';
import { ExportData } from './application/use-cases/export-data';
import { EXPORT_ARCHIVE_BUILDER } from './application/ports/export';
import { ZipExportBuilder } from './infrastructure/export/zip-export-builder';
import { FinalizeDeletionsJob } from './infrastructure/jobs/finalize-deletions.job';
import { AccountController } from './presentation/http/account.controller';
import {
  ListSessions,
  RevokeOtherSessions,
  RevokeSession,
} from './application/use-cases/manage-sessions';
import { SessionsController } from './presentation/http/sessions.controller';
import { HandleAppleNotification } from './application/use-cases/handle-apple-notification';
import { AuthGuard } from '../shared-kernel/presentation/auth.guard';
import {
  BUDGET_EXPORT_PORT,
  BUDGET_MEMBERSHIP_PORT,
} from './application/ports/budgets';
import { IDENTITY_MAILER, LINK_BUILDER } from './application/ports/mailer';
import {
  APPLE_CODE_EXCHANGER,
  APPLE_IDENTITY_VERIFIER,
  APPLE_NOTIFICATION_VERIFIER,
  GOOGLE_IDENTITY_VERIFIER,
} from './application/ports/providers';
import {
  ACCESS_TOKEN_ISSUER,
  BREACHED_PASSWORD_CHECKER,
  PASSWORD_HASHER,
  SECRET_ENCRYPTOR,
  SECRET_TOKEN_GENERATOR,
} from './application/ports/security';
import { SIGN_IN_METHODS_READER } from './application/ports/sign-in-methods';
import { Authenticator } from './application/services/authenticator';
import { EmailConfirmationSender } from './application/services/email-confirmation-sender';
import { EmailTokenIssuer } from './application/services/email-token-issuer';
import { MeView } from './application/services/me-view';
import { PasswordVerifier } from './application/services/password-verifier';
import { SessionIssuer } from './application/services/session-issuer';
import {
  ConfirmLinkByEmail,
  IdentityLinker,
  LinkIdentityWithPassword,
  RequestLinkByEmail,
} from './application/use-cases/link-identity';
import { SignInWithProvider } from './application/use-cases/sign-in-with-provider';
import { SignUp } from './application/use-cases/sign-up';
import {
  AUTH_IDENTITY_REPOSITORY,
  EMAIL_TOKEN_REPOSITORY,
  PENDING_LINK_REPOSITORY,
  SECURITY_EVENT_LOG,
  SESSION_REPOSITORY,
  USER_REPOSITORY,
} from './domain/ports/repositories';
import { BudgetsCoreModule } from '../budgets/budgets-core.module';
import { AccountHandoff } from '../budgets/application/use-cases/account-handoff';
import { AppLinkBuilder } from './infrastructure/link-builder';
import { NestIdentityMailer } from './infrastructure/mail/nest-identity-mailer';
import { DrizzleAuthIdentityRepository } from './infrastructure/persistence/drizzle-auth-identity.repository';
import { DrizzlePendingLinkRepository } from './infrastructure/persistence/drizzle-pending-link.repository';
import { AppleRestCodeExchanger } from './infrastructure/providers/apple-code-exchanger';
import { AppleIdentityVerifier } from './infrastructure/providers/apple-identity-verifier';
import { GoogleIdentityVerifier } from './infrastructure/providers/google-identity-verifier';
import { AesGcmSecretEncryptor } from './infrastructure/security/aes-gcm-secret-encryptor';
import { HibpBreachedPasswordChecker } from './infrastructure/security/hibp-breached-password-checker';
import { DrizzleEmailTokenRepository } from './infrastructure/persistence/drizzle-email-token.repository';
import { DrizzleSecurityEventLog } from './infrastructure/persistence/drizzle-security-event-log';
import { DrizzleSessionRepository } from './infrastructure/persistence/drizzle-session.repository';
import { DrizzleUserRepository } from './infrastructure/persistence/drizzle-user.repository';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher';
import { JoseAccessTokenIssuer } from './infrastructure/security/jose-access-token-issuer';
import { CryptoSecretTokenGenerator } from './infrastructure/security/secret-token-generator';

/** Binds every identity port to its adapter (research R19). */
const adapters: Provider[] = [
  { provide: USER_REPOSITORY, useClass: DrizzleUserRepository },
  { provide: SESSION_REPOSITORY, useClass: DrizzleSessionRepository },
  { provide: EMAIL_TOKEN_REPOSITORY, useClass: DrizzleEmailTokenRepository },
  { provide: SECURITY_EVENT_LOG, useClass: DrizzleSecurityEventLog },
  { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
  { provide: SECRET_TOKEN_GENERATOR, useClass: CryptoSecretTokenGenerator },
  { provide: ACCESS_TOKEN_ISSUER, useClass: JoseAccessTokenIssuer },
  DrizzleAuthIdentityRepository,
  {
    provide: AUTH_IDENTITY_REPOSITORY,
    useExisting: DrizzleAuthIdentityRepository,
  },
  {
    provide: SIGN_IN_METHODS_READER,
    useExisting: DrizzleAuthIdentityRepository,
  },
  { provide: PENDING_LINK_REPOSITORY, useClass: DrizzlePendingLinkRepository },
  { provide: BREACHED_PASSWORD_CHECKER, useClass: HibpBreachedPasswordChecker },
  { provide: SECRET_ENCRYPTOR, useClass: AesGcmSecretEncryptor },
  AppleIdentityVerifier,
  { provide: APPLE_IDENTITY_VERIFIER, useExisting: AppleIdentityVerifier },
  { provide: APPLE_NOTIFICATION_VERIFIER, useExisting: AppleIdentityVerifier },
  { provide: GOOGLE_IDENTITY_VERIFIER, useClass: GoogleIdentityVerifier },
  { provide: APPLE_CODE_EXCHANGER, useClass: AppleRestCodeExchanger },
  { provide: IDENTITY_MAILER, useClass: NestIdentityMailer },
  { provide: EXPORT_ARCHIVE_BUILDER, useClass: ZipExportBuilder },
  { provide: LINK_BUILDER, useClass: AppLinkBuilder },
  // Spec 002 implements the budget ports (account deletion hand-off, export).
  { provide: BUDGET_MEMBERSHIP_PORT, useExisting: AccountHandoff },
  { provide: BUDGET_EXPORT_PORT, useExisting: AccountHandoff },
];

const services: Provider[] = [
  MeView,
  SessionIssuer,
  Authenticator,
  AuthGuard,
  EmailTokenIssuer,
  EmailConfirmationSender,
  PasswordVerifier,
  IdentityLinker,
];

const useCases: Provider[] = [
  ExportData,
  PreviewDeletion,
  RequestDeletion,
  CancelDeletion,
  CancelDeletionByLink,
  FinalizeDeletion,
  FinalizeDeletionsJob,
  ListSessions,
  RevokeSession,
  RevokeOtherSessions,
  UpdateProfile,
  Reauthenticate,
  ReauthTokenChecker,
  RequestPasswordReset,
  CompletePasswordReset,
  ConfirmEmail,
  ResendConfirmation,
  GetMe,
  LogIn,
  LogOut,
  RefreshSession,
  SignUp,
  SignInWithProvider,
  LinkIdentityWithPassword,
  RequestLinkByEmail,
  ConfirmLinkByEmail,
  HandleAppleNotification,
];

@Global()
@Module({
  imports: [BudgetsCoreModule],
  controllers: [
    AuthController,
    AppleNotificationsController,
    MeController,
    SessionsController,
    AccountController,
  ],
  providers: [...adapters, ...services, ...useCases],
  exports: [Authenticator, AuthGuard],
})
export class IdentityModule {}
