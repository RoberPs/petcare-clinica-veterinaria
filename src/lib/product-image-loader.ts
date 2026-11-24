// Fotos de producto subidas desde el panel (G4): se guardan en tres anchos WebP fijos y next/image
// las pide con este loader, que elige la variante más cercana por arriba. Así hay srcset sin el
// optimizador de Next en tiempo de ejecución. Las rutas de la demo (/media/…svg) no se tocan.

export const UPLOAD_WIDTHS = [480, 960, 1440] as const;
export type UploadWidth = (typeof UPLOAD_WIDTHS)[number];

/** Prefijo de `products.image_path` de una foto subida: `/media/subidas/productos/<uuid>`. */
export const UPLOADED_IMAGE_PREFIX = '/media/subidas/productos/';

const UPLOADED_RE = /^\/media\/subidas\/productos\/[0-9a-f-]{36}$/;

export function isUploadedImage(src: string | null | undefined): src is string {
  return typeof src === 'string' && UPLOADED_RE.test(src);
}

export function uploadedImageLoader({ src, width }: { src: string; width: number }): string {
  if (!isUploadedImage(src)) return src;
  const w = UPLOAD_WIDTHS.find((candidate) => candidate >= width) ?? UPLOAD_WIDTHS[UPLOAD_WIDTHS.length - 1];
  return `${src}-${w}.webp`;
}
