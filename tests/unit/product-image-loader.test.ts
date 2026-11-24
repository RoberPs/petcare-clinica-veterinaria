import { describe, expect, it } from 'vitest';
import { isUploadedImage, uploadedImageLoader, UPLOAD_WIDTHS } from '@/lib/product-image-loader';

// Loader de las fotos subidas (G4): elige la variante WebP más cercana por arriba.

const SRC = '/media/subidas/productos/0b7c6f3e-3f1a-4c55-9d1e-6a2b8c9d0e1f';

describe('uploadedImageLoader', () => {
  it('elige 480, 960 o 1440 según el ancho pedido', () => {
    expect(UPLOAD_WIDTHS).toEqual([480, 960, 1440]);
    expect(uploadedImageLoader({ src: SRC, width: 256 })).toBe(`${SRC}-480.webp`);
    expect(uploadedImageLoader({ src: SRC, width: 480 })).toBe(`${SRC}-480.webp`);
    expect(uploadedImageLoader({ src: SRC, width: 640 })).toBe(`${SRC}-960.webp`);
    expect(uploadedImageLoader({ src: SRC, width: 1080 })).toBe(`${SRC}-1440.webp`);
    expect(uploadedImageLoader({ src: SRC, width: 3840 })).toBe(`${SRC}-1440.webp`);
  });

  it('deja intactas las rutas media/… de la demo', () => {
    const svg = '/media/petcare/productos/pelota.svg';
    expect(isUploadedImage(svg)).toBe(false);
    expect(isUploadedImage(SRC)).toBe(true);
    expect(uploadedImageLoader({ src: svg, width: 640 })).toBe(svg);
  });
});
