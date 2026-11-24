import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { productSchema } from '@/domain/store-schemas';
import { ProductImageError, storeProductImage } from '@/lib/admin/product-images';
import { saveProduct } from '@/lib/admin/products';
import { adminCtx, seedShop } from './helpers/checkout';
import { q, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { useTempUploadsDir } from './helpers/uploads';

// Fotos de producto (G4, FR-006): imagen real, sin metadatos, tres anchos WebP sin ampliar y
// archivos antiguos borrados tras sustituir la foto.

let uploads: Awaited<ReturnType<typeof useTempUploadsDir>>;
const files = () => readdirSync(path.join(uploads.dir, 'productos'));
const blob = (data: Buffer | string, type = 'application/octet-stream') => new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type });

async function photo(width: number, height: number, format: 'jpeg' | 'png' | 'gif' = 'jpeg', exif = false): Promise<Buffer> {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } } });
  if (exif) {
    // Orientación 6 (girada 90°) y un bloque GPS, como una foto de móvil.
    return img
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Copyright: 'Autor de prueba' }, IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'W' } })
      .toBuffer();
  }
  return format === 'jpeg' ? img.jpeg().toBuffer() : format === 'png' ? img.png().toBuffer() : img.gif().toBuffer();
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (error) {
    return error instanceof ProductImageError ? error.code : String(error);
  }
}

describe('fotos de producto', () => {
  beforeAll(async () => {
    await setupTestDb();
    uploads = await useTempUploadsDir();
  });
  afterAll(async () => {
    await uploads.cleanup();
    await teardownTestDb();
  });

  it('un JPEG con EXIF y GPS da tres WebP sin metadatos y enderezados', async () => {
    const input = await photo(2000, 1500, 'jpeg', true);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const stored = await storeProductImage(blob(input, 'image/jpeg'));
    expect(stored.imagePath).toMatch(/^\/media\/subidas\/productos\/[0-9a-f-]{36}$/);
    const id = stored.imagePath.split('/').pop()!;
    for (const w of [480, 960, 1440]) {
      const file = path.join(uploads.dir, 'productos', `${id}-${w}.webp`);
      expect(existsSync(file)).toBe(true);
      // Se lee a memoria: en Windows, sharp con una ruta deja el archivo abierto y no se puede borrar.
      const meta = await sharp(readFileSync(file)).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.orientation ?? 1).toBe(1);
      // Orientación 6: la foto apaisada pasa a vertical.
      expect(meta.height!).toBeGreaterThan(meta.width!);
      expect(meta.width).toBe(Math.min(w, 1500));
    }
    expect(stored).toMatchObject({ width: 1440, height: 1920 });
  });

  it('nunca amplía una foto pequeña', async () => {
    const stored = await storeProductImage(blob(await photo(300, 200, 'png'), 'image/png'));
    const id = stored.imagePath.split('/').pop()!;
    for (const w of [480, 960, 1440]) {
      expect((await sharp(readFileSync(path.join(uploads.dir, 'productos', `${id}-${w}.webp`))).metadata()).width).toBe(300);
    }
    expect(stored).toMatchObject({ width: 300, height: 200 });
  });

  it('rechaza lo que no es una imagen válida, un GIF, más de 5 MB o más de 40 MP', async () => {
    const before = files().length;
    expect(await codeOf(storeProductImage(blob('esto no es una foto', 'image/jpeg')))).toBe('invalid');
    expect(await codeOf(storeProductImage(blob(await photo(50, 50, 'gif'), 'image/jpeg')))).toBe('format');
    expect(await codeOf(storeProductImage(blob(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/jpeg')))).toBe('too_large');
    expect(await codeOf(storeProductImage(blob(await photo(7000, 6000, 'png'), 'image/png')))).toBe('too_many_pixels');
    expect(files().length).toBe(before);
  });

  describe('al sustituir o quitar la foto', () => {
    beforeEach(async () => {
      await truncateAll();
      await seedShop();
    });

    it('borra los archivos antiguos después del commit', async () => {
      const admin = await adminCtx();
      const [cat] = await q<{ id: string }>('SELECT id FROM product_categories LIMIT 1');
      const [pet] = await q<{ id: string }>('SELECT id FROM product_pets LIMIT 1');
      const raw = {
        name: 'Producto con foto',
        short_description: 'Descripción corta de prueba.',
        description_md: 'Descripción larga del producto de prueba.',
        category_id: cat!.id,
        pet_ids: [pet!.id],
        price: '10',
        vat_rate: '21',
        stock_initial: '3',
        position: '0',
        published: 'on',
        image_alt: 'Foto de prueba',
        has_image: true,
      };
      const now = new Date();
      const created = await saveProduct(admin, productSchema.parse(raw), { now, image: blob(await photo(800, 800), 'image/jpeg') });
      expect(created.status).toBe('ok');
      const id = (created as { id: string }).id;
      const first = (await q<{ image_path: string }>('SELECT image_path FROM products WHERE id = $1', [id]))[0]!.image_path;
      const firstId = first.split('/').pop()!;
      expect(files().filter((f) => f.startsWith(firstId))).toHaveLength(3);

      const replaced = await saveProduct(admin, productSchema.parse({ ...raw, id }), { now, image: blob(await photo(600, 600), 'image/jpeg') });
      expect(replaced.status).toBe('ok');
      const second = (await q<{ image_path: string }>('SELECT image_path FROM products WHERE id = $1', [id]))[0]!.image_path;
      expect(second).not.toBe(first);
      expect(files().filter((f) => f.startsWith(firstId))).toHaveLength(0);

      const removed = await saveProduct(admin, productSchema.parse({ ...raw, id, remove_image: 'on', has_image: false }), { now });
      expect(removed.status).toBe('ok');
      const row = (await q('SELECT image_path, image_alt, image_width, image_height FROM products WHERE id = $1', [id]))[0]!;
      expect(row).toMatchObject({ image_path: null, image_alt: null, image_width: null, image_height: null });
      expect(files().filter((f) => f.startsWith(second.split('/').pop()!))).toHaveLength(0);
    });
  });
});
