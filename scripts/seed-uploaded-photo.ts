/**
 * Prepara Lighthouse CI (feature 008, SC-008): sustituye la imagen de un producto de la demo por una
 * foto "subida" (tres WebP en UPLOADS_DIR), como haría el panel, para medir la ficha con una foto
 * real. Uso: npx tsx scripts/seed-uploaded-photo.ts [slug]. Solo para la CI y pruebas locales.
 */
import { loadDotEnv } from './load-env';

loadDotEnv();

const slug = process.argv[2] ?? 'cama-acolchada';
const { closeDb, getDb } = await import('../src/db/client');
const { products } = await import('../src/db/schema');
const { storeProductImage } = await import('../src/lib/admin/product-images');
const { eq } = await import('drizzle-orm');
const sharp = (await import('sharp')).default;

try {
  // Foto sintética de 1600 × 1600 con un degradado (sin datos de nadie).
  const size = 1600;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cee5ef"/><stop offset="1" stop-color="#9dd1b1"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="800" cy="800" r="420" fill="#00263e" opacity="0.15"/></svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  const stored = await storeProductImage(new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }));
  const updated = await getDb()
    .update(products)
    .set({ imagePath: stored.imagePath, imageWidth: stored.width, imageHeight: stored.height, imageAlt: 'Foto de prueba del producto' })
    .where(eq(products.slug, slug))
    .returning({ id: products.id });
  if (updated.length === 0) throw new Error(`No existe el producto ${slug}`);
  console.log(`Foto subida para ${slug}: ${stored.imagePath} (${stored.width} × ${stored.height}).`);
} catch (error) {
  console.error('No se ha podido preparar la foto:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
