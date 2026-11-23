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

const forceBooking = process.argv.includes('--force-booking');
if (forceBooking) console.warn('Aviso: --force-booking. Se sobrescriben los datos de agenda del panel.');

try {
  const summary = await loadContentFile(getDb(), file, forceBooking ? { forceBooking: true } : {});
  console.log(
    `Contenido cargado desde ${file}: ${summary.services} servicios, ${summary.team} profesionales, ` +
      `${summary.faqs} preguntas, ${summary.closures} cierres y ${summary.species} especies. ` +
      `Tienda: ${summary.products} productos, ${summary.shopCategories} categorías y ${summary.shopPets} mascotas` +
      ` (${summary.productsHidden} productos despublicados). ` +
      `Consejos: ${summary.posts} publicaciones (${summary.postsHidden} despublicadas) y ` +
      `${summary.postCategories} categorías. Boletín: ${summary.newsletterEnabled ? 'activo' : 'desactivado'}.`,
  );
  for (const slug of summary.compareAtIgnored) {
    console.warn(`Aviso: ${slug} tiene compare_at_price menor o igual que price; no se mostrará en oferta.`);
  }
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
