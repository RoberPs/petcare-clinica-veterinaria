/**
 * npm run email:dispatch — encola los recordatorios de cita que tocan (feature 003, B17) y envía los
 * correos pendientes de la bandeja de salida. En producción lo lanza el temporizador
 * petcare-email-dispatch (cada minuto) con cli/email-dispatch.mjs, compilado desde este archivo.
 */
import { loadDotEnv } from './load-env';

loadDotEnv();

const { closeDb, getDb } = await import('../src/db/client');
const { dispatchPending } = await import('../src/email/dispatch');
const { enqueueDueReminders } = await import('../src/lib/booking/reminders');

try {
  // Si falla el recordatorio, la bandeja se procesa igual.
  try {
    const reminders = await enqueueDueReminders(getDb(), new Date());
    if (reminders.length > 0) console.log(`Recordatorios de cita: ${reminders.length} encolado(s).`);
  } catch (error) {
    console.error('No se han podido encolar los recordatorios:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
  const { processed } = await dispatchPending({ limit: 200 });
  console.log(`Bandeja de salida: ${processed} correo(s) procesado(s).`);
} catch (error) {
  console.error('No se ha podido procesar la bandeja de salida:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
