/** npm run email:dispatch — envía los correos pendientes de la bandeja de salida y termina. */
import { loadDotEnv } from './load-env';

loadDotEnv();

const { closeDb } = await import('../src/db/client');
const { dispatchPending } = await import('../src/email/dispatch');

try {
  const { processed } = await dispatchPending({ limit: 200 });
  console.log(`Bandeja de salida: ${processed} correo(s) procesado(s).`);
} catch (error) {
  console.error('No se ha podido procesar la bandeja de salida:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
