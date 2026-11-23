import Link from 'next/link';
import { CookieBannerEnhancer } from './CookieBannerEnhancer';

// Aviso de cookies (FR-035): se renderiza en el servidor solo si no hay una elección vigente.
// "Aceptar" y "Rechazar" son dos botones iguales (misma clase, tamaño y prominencia).
export function CookieBanner({ returnTo }: { returnTo: string }) {
  return (
    <div className="cookie-banner" role="region" aria-label="Aviso de cookies">
      <CookieBannerEnhancer returnTo={returnTo}>
        <p>
          Usamos una cookie propia para recordar tu elección. El mapa de OpenStreetMap es de un tercero y solo se carga
          si lo aceptas. <Link prefetch={false} href="/politica-de-cookies">Política de cookies</Link>
        </p>
        <div className="cookie-banner__actions">
          <button className="btn" type="submit" name="choice" value="accept">
            Aceptar
          </button>
          <button className="btn" type="submit" name="choice" value="reject">
            Rechazar
          </button>
        </div>
      </CookieBannerEnhancer>
    </div>
  );
}
