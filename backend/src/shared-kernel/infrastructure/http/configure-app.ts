import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { DomainErrorFilter } from '../../presentation/domain-error.filter';

/** HTTP setup shared by main.ts and the e2e tests. */
export function configureApp(
  app: INestApplication,
  options: { trustProxy: boolean },
): void {
  app.useLogger(app.get(Logger));
  (app as NestExpressApplication).set('trust proxy', options.trustProxy);
  app.setGlobalPrefix('v1', { exclude: ['.well-known/{*path}', 'l/{*path}'] });
  app.useGlobalFilters(new DomainErrorFilter());
  app.enableShutdownHooks();
}
