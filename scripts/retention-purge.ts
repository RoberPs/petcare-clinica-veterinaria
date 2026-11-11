/** npm run retention:purge — borra los mensajes caducados (12 meses) y los registros del límite (24 h). */
import { loadDotEnv } from './load-env';

loadDotEnv();

const { closeDb, getDb } = await import('../src/db/client');
const { purgeExpired } = await import('../src/db/retention');

try {
  const { messages, hits } = await purgeExpired(getDb());
  console.log(`Purga: ${messages} mensaje(s) y ${hits} registro(s) del límite borrados.`);
} catch (error) {
  console.error('No se ha podido completar la purga:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
