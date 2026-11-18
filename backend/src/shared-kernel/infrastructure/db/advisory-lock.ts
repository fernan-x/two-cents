import type { Database } from './database';

/** Advisory lock keys, one per scheduled job, so only one instance runs each job at a time. */
export const LOCK_KEYS = {
  finalizeDeletions: 1_001_042, // spec 001, FR-042
  expireInvitations: 1_002_012, // spec 002, FR-012
  purgeBudgets: 1_002_038, // spec 002, FR-038b
  outboxRetention: 1_002_900, // spec 002, research R9
  materializeRecurring: 1_004_036, // spec 004, FR-036
} as const;

/**
 * Runs `work` while holding a session-level advisory lock on a dedicated connection. Returns
 * `undefined` without running it when another instance holds the lock.
 */
export async function withAdvisoryLock<T>(
  db: Database,
  key: number,
  work: () => Promise<T>,
): Promise<T | undefined> {
  const client = await db.$client.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [key],
    );
    if (!rows[0]?.locked) return undefined;
    try {
      return await work();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [key]);
    }
  } finally {
    client.release();
  }
}
