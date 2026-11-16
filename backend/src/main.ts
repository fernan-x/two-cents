import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './shared-kernel/infrastructure/config/env';
import { configureApp } from './shared-kernel/infrastructure/http/configure-app';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app, { trustProxy: process.env.TRUST_PROXY === 'true' });
  await app.listen(env.PORT);
}

void bootstrap();
