import { Global, Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { TRANSACTION_RUNNER } from '../../application/ports';
import { ENV, type Env } from '../config/env';
import { DrizzleTransactionRunner } from './drizzle-transaction-runner';
import * as schema from './schema';

@Global()
@Module({
  imports: [
    DrizzleModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        drizzle,
        connection: { connectionString: env.DATABASE_URL, max: 10 },
        schema,
      }),
    }),
  ],
  providers: [
    DrizzleTransactionRunner,
    { provide: TRANSACTION_RUNNER, useExisting: DrizzleTransactionRunner },
  ],
  exports: [DrizzleTransactionRunner, TRANSACTION_RUNNER],
})
export class DbModule {}
