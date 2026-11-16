import { Module } from '@nestjs/common';
import { MailModule as NestMailModule, SmtpTransport } from '@nestjs/mail';
import { ENV, type Env } from '../config/env';

/** One mail module for the whole backend (research R14/R20). Tests override MailTransport with InMemoryMailTransport. */
@Module({
  imports: [
    NestMailModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        transport: new SmtpTransport({ url: env.SMTP_URL }),
        from: env.MAIL_FROM,
      }),
    }),
  ],
})
export class MailModule {}
