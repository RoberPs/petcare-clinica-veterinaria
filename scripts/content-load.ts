/** npm run content:load -- --file content/<clinica>.yaml — carga el contenido de una clínica en la base de datos. */
import { loadDotEnv } from './load-env';

loadDotEnv();

const { closeDb, getDb } = await import('../src/db/client');
const { ContentValidationError, loadContentFile } = await import('../src/content/load');

const i = process.argv.indexOf('--file');
const file = i >= 0 ? process.argv[i + 1] : undefined;

if (!file) {
  console.error('Uso: npm run content:load -- --file content/<clinica>.yaml');
  process.exit(2);
}

try {
  const summary = await loadContentFile(getDb(), file);
  console.log(
    `Contenido cargado desde ${file}: ${summary.services} servicios, ${summary.team} profesionales, ` +
      `${summary.faqs} preguntas, ${summary.closures} cierres y ${summary.species} especies.`,
  );
} catch (error) {
  if (error instanceof ContentValidationError) {
    console.error(`No se ha cargado nada: ${file} tiene ${error.issues.length} error(es):`);
    for (const issue of error.issues) console.error(`  - ${issue.path}: ${issue.message}`);
  } else {
    console.error('No se ha podido cargar el contenido:', error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
} finally {
  await closeDb();
}
