import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ENV, type Env } from '../config/env';

/** Paths that must never reach the logs (constitution Principle III). */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body',
  '*.password',
  '*.newPassword',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.identityToken',
  '*.idToken',
  '*.authorizationCode',
  '*.reauthToken',
  '*.linkToken',
  '*.email',
];

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level:
            env.NODE_ENV === 'test'
              ? 'silent'
              : env.NODE_ENV === 'production'
                ? 'info'
                : 'debug',
          redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
          // URLs of email-link routes carry no token (tokens go in bodies), but strip query strings anyway.
          serializers: {
            req: (req: { method: string; url: string }) => ({
              method: req.method,
              url: req.url.split('?')[0],
            }),
          },
        },
      }),
    }),
  ],
})
export class LoggerModule {}
