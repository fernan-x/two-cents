import { Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import {
  AppleSignInRequest,
  ConfirmEmailRequest,
  ForgotPasswordRequest,
  ReauthenticateRequest,
  ResetPasswordRequest,
  type Me,
  type AuthResult,
  GoogleSignInRequest,
  LinkConfirmRequest,
  LinkEmailRequest,
  LinkPasswordRequest,
  LoginRequest,
  RefreshRequest,
  type Tokens,
  SignUpRequest,
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
import { ZodBody } from '../../../shared-kernel/presentation/zod-validation.pipe';
import {
  ConfirmLinkByEmail,
  LinkIdentityWithPassword,
  RequestLinkByEmail,
} from '../../application/use-cases/link-identity';
import { SignInWithProvider } from '../../application/use-cases/sign-in-with-provider';
import {
  ConfirmEmail,
  ResendConfirmation,
} from '../../application/use-cases/email-confirmation';
import {
  CompletePasswordReset,
  RequestPasswordReset,
} from '../../application/use-cases/password-reset';
import { Reauthenticate } from '../../application/use-cases/reauthenticate';
import {
  LogIn,
  LogOut,
  RefreshSession,
} from '../../application/use-cases/sessions';
import { SignUp } from '../../application/use-cases/sign-up';

/** Sign-up, sign-in and account linking (contracts/api.md). */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly signUp: SignUp,
    private readonly providerSignIn: SignInWithProvider,
    private readonly linkWithPassword: LinkIdentityWithPassword,
    private readonly requestLinkByEmail: RequestLinkByEmail,
    private readonly confirmLinkByEmail: ConfirmLinkByEmail,
    private readonly logIn: LogIn,
    private readonly refreshSession: RefreshSession,
    private readonly logOut: LogOut,
    private readonly confirmEmail: ConfirmEmail,
    private readonly resendConfirmation: ResendConfirmation,
    private readonly requestPasswordReset: RequestPasswordReset,
    private readonly completePasswordReset: CompletePasswordReset,
    private readonly reauthenticate: Reauthenticate,
  ) {}

  @Post('reauthenticate')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @AuthThrottle()
  reauth(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(ReauthenticateRequest) body: z.infer<typeof ReauthenticateRequest>,
  ): Promise<{ reauthToken: string; expiresAt: string }> {
    return this.reauthenticate.execute(auth, body);
  }

  @Post('password/forgot')
  @HttpCode(202)
  @AuthThrottle()
  async forgotPassword(
    @ZodBody(ForgotPasswordRequest) body: z.infer<typeof ForgotPasswordRequest>,
  ): Promise<void> {
    await this.requestPasswordReset.execute(body.email);
  }

  @Post('password/reset')
  @HttpCode(204)
  @AuthThrottle()
  async resetPassword(
    @ZodBody(ResetPasswordRequest) body: z.infer<typeof ResetPasswordRequest>,
  ): Promise<void> {
    await this.completePasswordReset.execute(body);
  }

  @Post('email/confirm')
  @HttpCode(200)
  @AuthThrottle()
  confirm(
    @ZodBody(ConfirmEmailRequest) body: z.infer<typeof ConfirmEmailRequest>,
  ): Promise<{ me: Me }> {
    return this.confirmEmail.execute(body.token);
  }

  @Post('email/resend-confirmation')
  @HttpCode(202)
  @UseGuards(AuthGuard)
  @AuthThrottle(3)
  async resend(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.resendConfirmation.execute(auth.userId);
  }

  @Post('login')
  @HttpCode(200)
  @AuthThrottle()
  login(
    @ZodBody(LoginRequest) body: z.infer<typeof LoginRequest>,
  ): Promise<AuthResult> {
    return this.logIn.execute(body);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(
    @ZodBody(RefreshRequest) body: z.infer<typeof RefreshRequest>,
  ): Promise<{ tokens: Tokens }> {
    return this.refreshSession.execute(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @AllowPendingDeletion()
  async logout(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.logOut.execute(auth.sessionId);
  }

  @Post('signup')
  @HttpCode(201)
  @AuthThrottle()
  signup(
    @ZodBody(SignUpRequest) body: z.infer<typeof SignUpRequest>,
  ): Promise<AuthResult> {
    return this.signUp.execute(body);
  }

  @Post('apple')
  @AuthThrottle()
  async apple(
    @ZodBody(AppleSignInRequest) body: z.infer<typeof AppleSignInRequest>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const { created, ...result } = await this.providerSignIn.execute({
      provider: 'apple',
      token: body.identityToken,
      authorizationCode: body.authorizationCode,
      firstName: body.firstName,
      locale: body.locale,
      device: body.device,
    });
    res.status(created ? 201 : 200);
    return result;
  }

  @Post('google')
  @AuthThrottle()
  async google(
    @ZodBody(GoogleSignInRequest) body: z.infer<typeof GoogleSignInRequest>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const { created, ...result } = await this.providerSignIn.execute({
      provider: 'google',
      token: body.idToken,
      locale: body.locale,
      device: body.device,
    });
    res.status(created ? 201 : 200);
    return result;
  }

  @Post('link/password')
  @HttpCode(200)
  @AuthThrottle()
  linkPassword(
    @ZodBody(LinkPasswordRequest) body: z.infer<typeof LinkPasswordRequest>,
  ): Promise<AuthResult> {
    return this.linkWithPassword.execute(body);
  }

  @Post('link/email')
  @HttpCode(202)
  @AuthThrottle()
  async linkEmail(
    @ZodBody(LinkEmailRequest) body: z.infer<typeof LinkEmailRequest>,
  ): Promise<void> {
    await this.requestLinkByEmail.execute(body);
  }

  @Post('link/confirm')
  @HttpCode(200)
  @AuthThrottle()
  linkConfirm(
    @ZodBody(LinkConfirmRequest) body: z.infer<typeof LinkConfirmRequest>,
  ): Promise<AuthResult> {
    return this.confirmLinkByEmail.execute(body);
  }
}
