/**
 * npm run orders -- <orden> — gestión de pedidos sin panel (feature 005, contracts/cli.md).
 * En producción: docker compose exec petcare-app node cli/orders.mjs <orden>. Los correos que
 * genere un cambio de estado los envía el temporizador petcare-email-dispatch.
 */
import { loadDotEnv } from './load-env';

loadDotEnv();

const { closeDb } = await import('../src/db/client');
const { runOrdersCli } = await import('../src/lib/orders/cli');

try {
  process.exitCode = await runOrdersCli(process.argv.slice(2), (line) => console.log(line), new Date());
} catch (error) {
  console.error('No se ha podido completar la orden:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
