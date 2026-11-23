import { ProductNotFound } from '@/components/ProductNotFound';

// 404 de la ficha cuando se llega por navegación del cliente; la carga directa la resuelve el middleware.
export default function NotFound() {
  return <ProductNotFound />;
}
