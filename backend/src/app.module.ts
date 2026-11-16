import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { IdentityModule } from './identity/identity.module';
import { EnvModule } from './shared-kernel/infrastructure/config/env.module';
import { DbModule } from './shared-kernel/infrastructure/db/db.module';
import { HttpContextModule } from './shared-kernel/infrastructure/http/http.module';
import { LoggerModule } from './shared-kernel/infrastructure/logging/logger.module';
import { MailModule } from './shared-kernel/infrastructure/mail/mail.module';
import { SystemModule } from './shared-kernel/infrastructure/system/system.module';
import { WellKnownModule } from './shared-kernel/infrastructure/well-known/well-known.module';

@Module({
  imports: [
    EnvModule,
    LoggerModule,
    SystemModule,
    DbModule,
    MailModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
    ScheduleModule.forRoot(),
    HttpContextModule,
    IdentityModule,
    WellKnownModule,
  ],
})
export class AppModule {}
