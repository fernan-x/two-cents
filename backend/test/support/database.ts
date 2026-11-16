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

/** Empties every table in the public schema (keeps the migration journal). */
export async function truncateAll(db: Database): Promise<void> {
  const result = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const tables = result.rows.map((r) => `"public"."${r.tablename}"`);
  if (tables.length)
    await db.execute(
      sql.raw(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`),
    );
}
