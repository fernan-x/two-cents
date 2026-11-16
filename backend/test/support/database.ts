import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/shared-kernel/infrastructure/db/schema';
import type { Database } from '../../src/shared-kernel/infrastructure/db/database';
import { DrizzleTransactionRunner } from '../../src/shared-kernel/infrastructure/db/drizzle-transaction-runner';

export function createTestDatabase(): {
  db: Database;
  runner: DrizzleTransactionRunner;
  close: () => Promise<void>;
} {
  const db = drizzle({
    connection: { connectionString: process.env.DATABASE_URL! },
    schema,
  });
  return {
    db,
    runner: new DrizzleTransactionRunner(db),
    close: () => db.$client.end(),
  };
}

/** Empties every table in the public schema and the outbox tables (keeps the migration journals). */
export async function truncateAll(db: Database): Promise<void> {
  const result = await db.execute<{ schemaname: string; tablename: string }>(
    sql`SELECT schemaname, tablename FROM pg_tables
        WHERE schemaname = 'public'
           OR (schemaname = 'nest_outbox' AND tablename <> 'migrations')`,
  );
  const tables = result.rows.map((r) => `"${r.schemaname}"."${r.tablename}"`);
  if (tables.length)
    await db.execute(
      sql.raw(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`),
    );
}
