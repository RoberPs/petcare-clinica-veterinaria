'use client';

import Image from 'next/image';
import { isUploadedImage, uploadedImageLoader } from '@/lib/product-image-loader';

// Imagen de producto común al catálogo, la ficha, el carrito y el panel (G4). Las fotos subidas
// desde el panel usan el loader de las variantes WebP (480, 960 y 1440) con sus dimensiones reales;
// las SVG de la demo se sirven tal cual, como hasta ahora. Es un componente de cliente porque el
// loader es una función y no puede cruzar del servidor al cliente.

export const PRODUCT_PLACEHOLDER = '/media/comun/placeholder-producto.svg';
export const PLACEHOLDER_ALT = 'Imagen genérica: este producto todavía no tiene foto';

interface Props {
  imagePath: string | null;
  imageAlt: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Tamaño de las SVG de la demo y del marcador (cuadradas). */
  fallbackSize?: number;
}

export function ProductImage({ imagePath, imageAlt, imageWidth, imageHeight, sizes, priority = false, className, fallbackSize = 600 }: Props) {
  const loading = priority ? { priority: true } : { loading: 'lazy' as const };
  if (isUploadedImage(imagePath) && imageWidth && imageHeight) {
    return (
      <Image
        loader={uploadedImageLoader}
        src={imagePath}
        alt={imageAlt ?? ''}
        width={imageWidth}
        height={imageHeight}
        sizes={sizes}
        className={className}
        {...loading}
      />
    );
  }
  return (
    <Image
      src={imagePath ?? PRODUCT_PLACEHOLDER}
      alt={imagePath ? (imageAlt ?? '') : PLACEHOLDER_ALT}
      width={fallbackSize}
      height={fallbackSize}
      sizes={sizes}
      className={className}
      {...loading}
    />
  );
}
