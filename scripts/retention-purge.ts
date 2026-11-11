/**
 * npm run retention:purge — borra los mensajes caducados (12 meses), los registros del límite (24 h)
 * y, desde la feature 002, las cuentas sin verificar (7 días), sesiones y tokens caducados, envíos
 * procesados y correos de cuenta cerrados (24 h).
 */
import { loadDotEnv } from './load-env';

loadDotEnv();

const { closeDb, getDb } = await import('../src/db/client');
const { purgeExpired } = await import('../src/db/retention');

try {
  const r = await purgeExpired(getDb());
  console.log(
    `Purga: ${r.messages} mensaje(s), ${r.hits} registro(s) del límite, ${r.unverifiedAccounts} cuenta(s) sin verificar, ` +
      `${r.sessions} sesión(es), ${r.tokens} enlace(s), ${r.submissions} envío(s) procesado(s) y ${r.accountEmails} correo(s) de cuenta.`,
  );
} catch (error) {
  console.error('No se ha podido completar la purga:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
