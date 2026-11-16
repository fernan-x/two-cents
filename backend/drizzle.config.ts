import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/shared-kernel/infrastructure/db/schema/*.ts',
  out: './drizzle',
  // Only manage our own tables; never touch other schemas (e.g. nest_outbox from spec 002).
  schemaFilter: ['public'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://two_cents:two_cents@localhost:5442/two_cents',
  },
});
