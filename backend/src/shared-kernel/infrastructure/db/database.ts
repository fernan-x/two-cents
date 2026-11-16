import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type * as schema from './schema';

export type Database = NodePgDatabase<typeof schema> & { $client: Pool };
/** A transaction handle; it has the same query API as the database. */
export type DbExecutor =
  Parameters<Parameters<Database['transaction']>[0]>[0] | Database;
