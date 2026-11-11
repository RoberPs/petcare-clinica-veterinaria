/** npm run db:migrate — aplica las migraciones versionadas de drizzle/. */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadDotEnv } from './load-env';

loadDotEnv();

const { closeDb, getDb } = await import('../src/db/client');

try {
  await migrate(getDb(), { migrationsFolder: process.env.MIGRATIONS_DIR ?? 'drizzle' });
  console.log('Migraciones aplicadas.');
} catch (error) {
  console.error('No se han podido aplicar las migraciones:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
