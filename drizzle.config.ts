import { defineConfig } from 'drizzle-kit';

// Migraciones versionadas en drizzle/ (npm run db:generate las crea; npm run db:migrate las aplica).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://petcare:petcare@localhost:5434/petcare' },
  strict: true,
});
