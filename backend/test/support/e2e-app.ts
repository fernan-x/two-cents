import './test-env';
import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { Test } from '@nestjs/testing';
import { getDrizzleToken } from '@nestjs/drizzle';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { AppModule } from '../../src/app.module';
import type { Database } from '../../src/shared-kernel/infrastructure/db/database';
import { configureApp } from '../../src/shared-kernel/infrastructure/http/configure-app';
import { truncateAll } from './database';

export interface E2eApp {
  app: INestApplication;
  db: Database;
  mailbox: InMemoryMailTransport;
  /** HTTP client whose requests all come from one random client IP (rate limits are per IP). */
  client(ip?: string): TestAgent;
  reset(): Promise<void>;
  close(): Promise<void>;
}

/** Boots the real AppModule against postgres-test, with mail captured in memory and providers faked. */
export async function createE2eApp(
  overrides: Array<{ provide: unknown; useValue: unknown }> = [],
): Promise<E2eApp> {
  const mailbox = new InMemoryMailTransport();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailTransport)
    .useValue(mailbox);
  for (const o of overrides)
    builder = builder.overrideProvider(o.provide as never).useValue(o.useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { trustProxy: true });
  await app.init();
  const db = app.get<Database>(getDrizzleToken());

  return {
    app,
    db,
    mailbox,
    client(ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`) {
      const agent = request.agent(app.getHttpServer());
      return agent
        .set('X-Forwarded-For', ip)
        .set('User-Agent', 'TwoCentsTest/1.0');
    },
    async reset() {
      mailbox.clear();
      await truncateAll(db);
    },
    close: () => app.close(),
  };
}

export const device = {
  deviceName: 'iPhone de test',
  platform: 'ios' as const,
};
