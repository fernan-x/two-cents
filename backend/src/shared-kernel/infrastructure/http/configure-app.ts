import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { DomainErrorFilter } from '../../presentation/domain-error.filter';

/** HTTP setup shared by main.ts and the e2e tests. */
export function configureApp(
  app: INestApplication,
  options: { trustProxy: boolean; corsOrigins?: string[] },
): void {
  app.useLogger(app.get(Logger));
  (app as NestExpressApplication).set('trust proxy', options.trustProxy);
  // Spec 004 receipt photos (research R10): raw JPEG bodies. The 1 MB rule is checked by the use
  // case so it answers RECEIPT_TOO_LARGE; this cap only stops abuse.
  (app as NestExpressApplication).useBodyParser('raw', {
    type: 'image/jpeg',
    limit: '5mb',
  });
  app.setGlobalPrefix('v1', {
    exclude: ['.well-known/{*path}', 'l/{*path}', 'i/{*path}'],
  });
  app.useGlobalFilters(new DomainErrorFilter());
  if (options.corsOrigins?.length) {
    // Bearer tokens only, no cookies: credentials stay off.
    app.enableCors({
      origin: options.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    });
  }
  app.enableShutdownHooks();
}
