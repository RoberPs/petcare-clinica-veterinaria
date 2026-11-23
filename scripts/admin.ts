/**
 * npm run admin -- <orden> — rol de administrador del panel (feature 007, contracts/cli-and-content.md).
 * En producción: docker compose exec petcare-app node cli/admin.mjs <orden>.
 */
import { loadDotEnv } from './load-env';

loadDotEnv();

const { closeDb } = await import('../src/db/client');
const { runAdminCli } = await import('../src/lib/admin/cli');

try {
  process.exitCode = await runAdminCli(process.argv.slice(2), (line) => console.log(line), new Date());
} catch (error) {
  console.error('No se ha podido completar la orden:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
