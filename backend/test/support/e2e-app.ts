import './test-env';
import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { Test } from '@nestjs/testing';
import { getDrizzleToken } from '@nestjs/drizzle';
import { OutboxRelay } from '@nestjs/outbox';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { AppModule } from '../../src/app.module';
import type { Database } from '../../src/shared-kernel/infrastructure/db/database';
import { configureApp } from '../../src/shared-kernel/infrastructure/http/configure-app';
import { CLOCK, PUSH_SENDER } from '../../src/shared-kernel/application/ports';
import { truncateAll } from './database';
import { InMemoryPushSender, SettableClock } from './fakes';

export interface E2eApp {
  app: INestApplication;
  db: Database;
  mailbox: InMemoryMailTransport;
  pushes: InMemoryPushSender;
  /** Real time by default; `set`/`advance` freeze it (reset between tests by `reset()`). */
  clock: SettableClock;
  /** Delivers every pending outbox message now (the relay doesn't poll in tests). */
  drainOutbox(): Promise<void>;
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
  const pushes = new InMemoryPushSender();
  const clock = new SettableClock();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailTransport)
    .useValue(mailbox)
    .overrideProvider(PUSH_SENDER)
    .useValue(pushes)
    .overrideProvider(CLOCK)
    .useValue(clock);
  for (const o of overrides)
    builder = builder.overrideProvider(o.provide as never).useValue(o.useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { trustProxy: true });
  await app.init();
  const db = app.get<Database>(getDrizzleToken());
  const relay = app.get(OutboxRelay);

  return {
    app,
    db,
    mailbox,
    pushes,
    clock,
    async drainOutbox() {
      for (let i = 0; i < 20; i++) {
        const result = await relay.runOnce();
        if (result.claimed === 0) return;
      }
    },
    client(ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`) {
      const agent = request.agent(app.getHttpServer());
      return agent
        .set('X-Forwarded-For', ip)
        .set('User-Agent', 'TwoCentsTest/1.0');
    },
    async reset() {
      mailbox.clear();
      pushes.clear();
      clock.reset();
      await truncateAll(db);
    },
    close: () => app.close(),
  };
}

export const device = {
  deviceName: 'iPhone de test',
  platform: 'ios' as const,
};
