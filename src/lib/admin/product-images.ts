import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import { uploadsDir } from '@/lib/env';
import { logger } from '@/lib/logger';
import { isUploadedImage, UPLOAD_WIDTHS, UPLOADED_IMAGE_PREFIX } from '@/lib/product-image-loader';

// Fotos de producto subidas desde el panel (G4, FR-006). sharp decodifica la imagen (lo que prueba
// que es real), la endereza, descarta todos los metadatos (EXIF y GPS) y genera tres anchos WebP
// sin ampliar nunca. Se escriben de forma atómica en ${UPLOADS_DIR}/productos/<uuid>-<ancho>.webp.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const QUALITY = 80;

export type ProductImageErrorCode = 'too_large' | 'too_many_pixels' | 'format' | 'invalid';

export const PRODUCT_IMAGE_ERRORS: Record<ProductImageErrorCode, string> = {
  too_large: 'La foto pesa más de 5 MB. Elige una más ligera.',
  too_many_pixels: 'La foto es demasiado grande (más de 40 megapíxeles). Elige una más pequeña.',
  format: 'La foto tiene que ser JPEG, PNG o WebP.',
  invalid: 'El archivo no es una imagen válida.',
};

export class ProductImageError extends Error {
  constructor(public readonly code: ProductImageErrorCode) {
    super(`product_image_${code}`);
    this.name = 'ProductImageError';
  }
}

export interface StoredProductImage {
  /** Valor de `products.image_path`: `/media/subidas/productos/<uuid>`. */
  imagePath: string;
  width: number;
  height: number;
}

const productsDir = () => path.join(uploadsDir(), 'productos');
const fileName = (id: string, width: number) => `${id}-${width}.webp`;

async function writeAtomic(target: string, data: Buffer): Promise<void> {
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, data);
  try {
    await rename(tmp, target);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}

/** ¿Hay un archivo elegido en el campo? (Sin elegir, el navegador envía un File vacío.) */
export function hasUpload(value: FormDataEntryValue | null): value is File {
  return typeof value === 'object' && value !== null && value.size > 0;
}

/** Procesa y guarda la foto. Lanza ProductImageError si no es válida. */
export async function storeProductImage(file: Blob): Promise<StoredProductImage> {
  // El tope de tamaño se comprueba antes de leer o decodificar nada.
  if (file.size > MAX_IMAGE_BYTES) throw new ProductImageError('too_large');
  const input = Buffer.from(await file.arrayBuffer());
  if (input.length > MAX_IMAGE_BYTES) throw new ProductImageError('too_large');

  const options = { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' as const };
  let meta: Metadata;
  try {
    // Solo lee la cabecera: el tope de píxeles se comprueba aquí para dar un error claro.
    meta = await sharp(input, { failOn: 'error', limitInputPixels: false }).metadata();
  } catch {
    throw new ProductImageError('invalid');
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw new ProductImageError('format');
  if (!meta.width || !meta.height) throw new ProductImageError('invalid');
  if (meta.width * meta.height > MAX_IMAGE_PIXELS) throw new ProductImageError('too_many_pixels');

  const variants: { width: number; data: Buffer; info: OutputInfo }[] = [];
  try {
    for (const width of UPLOAD_WIDTHS) {
      // .rotate() sin argumentos aplica la orientación EXIF; sin withMetadata() no se copia nada.
      const { data, info } = await sharp(input, options)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer({ resolveWithObject: true });
      variants.push({ width, data, info });
    }
  } catch {
    throw new ProductImageError('invalid');
  }

  const id = randomUUID();
  const dir = productsDir();
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  try {
    for (const v of variants) {
      const target = path.join(dir, fileName(id, v.width));
      await writeAtomic(target, v.data);
      written.push(target);
    }
  } catch (error) {
    await Promise.all(written.map((f) => unlink(f).catch(() => undefined)));
    throw error;
  }
  const largest = variants[variants.length - 1]!.info;
  return { imagePath: `${UPLOADED_IMAGE_PREFIX}${id}`, width: largest.width, height: largest.height };
}

/**
 * Borra las variantes de una foto subida (tras el commit). Un fallo se registra y no se propaga:
 * un archivo huérfano nunca rompe una página. Las rutas de la demo (/media/…svg) se ignoran.
 */
export async function removeProductImageFiles(imagePath: string | null | undefined): Promise<void> {
  if (!isUploadedImage(imagePath)) return;
  const id = imagePath.slice(UPLOADED_IMAGE_PREFIX.length);
  await Promise.all(
    UPLOAD_WIDTHS.map(async (width) => {
      try {
        await unlink(path.join(productsDir(), fileName(id, width)));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') logger.warn({ code: code ?? 'unknown', width }, 'product_image_remove_failed');
      }
    }),
  );
}
