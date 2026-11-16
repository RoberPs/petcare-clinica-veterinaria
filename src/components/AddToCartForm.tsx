import { addToCart } from '@/app/carrito/actions';
import { QuantityField } from './QuantityField';

interface Props {
  productId: string;
  productName: string;
  /** Ruta a la que se vuelve (listado con filtros, búsqueda y página, o la ficha). */
  returnTo: string;
  /** "list": botón "Añadir" de la tarjeta; "detail": cantidad y "Añadir al carrito" en la ficha. */
  variant: 'list' | 'detail';
  /** Máximo que se puede pedir (min(stock, máximo por línea)); solo en la ficha. */
  max?: number;
  /** Controles extra dentro del mismo formulario (p. ej. "Comprar ahora" en la ficha, US8). */
  children?: React.ReactNode;
}

// Formulario POST de "Añadir" (D14): funciona sin JavaScript (Server Action con PRG). El botón es
// marino: la acción neutra (principio I), no el cian de la maqueta, que es para pedir cita.
export function AddToCartForm({ productId, productName, returnTo, variant, max = 1, children }: Props) {
  return (
    <form action={addToCart} className={variant === 'detail' ? 'add-to-cart' : undefined}>
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="return_to" value={returnTo} />
      {variant === 'detail' ? <QuantityField id={`cantidad-${productId}`} max={max} /> : null}
      <button type="submit" className={variant === 'detail' ? 'btn' : 'btn btn--sm'}>
        {variant === 'detail' ? (
          'Añadir al carrito'
        ) : (
          <>
            Añadir<span className="visually-hidden"> {productName} al carrito</span>
          </>
        )}
      </button>
      {children}
    </form>
  );
}
