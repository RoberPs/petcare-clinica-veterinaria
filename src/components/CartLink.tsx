import Image from 'next/image';
import Link from 'next/link';
import { isSectionEnabled, sectionHref, type Section } from '@/domain/sections';
import { cartUnitCount } from '@/db/queries/cart';
import { getCurrentSession } from '@/lib/auth/session';
import { hashCartToken, readCartToken } from '@/lib/cart/cookie';

export const cartLabel = (n: number) => `Carrito, ${n} ${n === 1 ? 'producto' : 'productos'}`;

/** Unidades del carrito: sin cookie ni sesión no hay consulta (plan: rendimiento). */
async function units(): Promise<number> {
  try {
    const session = await getCurrentSession();
    if (session) return await cartUnitCount({ customerId: session.id });
    const token = await readCartToken();
    return token ? await cartUnitCount({ tokenHash: hashCartToken(token) }) : 0;
  } catch {
    return 0;
  }
}

// "Carrito" de la cabecera, siempre el último (principio I), con el número de unidades.
export async function CartLink({ sections }: { sections: readonly Section[] }) {
  const href = sectionHref('carrito', sections);
  if (!isSectionEnabled('carrito', sections)) {
    return (
      <Link prefetch={false} className="icon-link" href={href} aria-label="Carrito">
        <Image src="/media/icons/carrito.svg" alt="" width={24} height={24} />
      </Link>
    );
  }
  const n = await units();
  return (
    <Link prefetch={false} className="icon-link cart-btn" href={href} aria-label={cartLabel(n)}>
      <Image src="/media/icons/carrito.svg" alt="" width={24} height={24} />
      <span className="cart-count" aria-hidden="true">
        {n}
      </span>
    </Link>
  );
}
