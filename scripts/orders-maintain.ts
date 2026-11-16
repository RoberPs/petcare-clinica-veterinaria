/**
 * npm run orders:maintain — concilia los pagos abiertos, caduca los pedidos vencidos y reintenta los
 * reembolsos (feature 005, D16). En producción lo lanza el temporizador petcare-orders-maintain
 * (cada minuto) con cli/orders-maintain.mjs, compilado desde este archivo. Sin datos personales en
 * la salida: solo contadores.
 */
import { loadDotEnv } from './load-env';

loadDotEnv();

const { closeDb } = await import('../src/db/client');
const { runOrdersMaintenance } = await import('../src/lib/orders/maintain');

try {
  const { reconciled, expired, refundsRetried } = await runOrdersMaintenance(new Date());
  console.log(`Pedidos: ${reconciled} conciliado(s), ${expired} caducado(s), ${refundsRetried} reembolso(s) reintentado(s).`);
} catch (error) {
  console.error('No se ha podido completar el mantenimiento de pedidos:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
