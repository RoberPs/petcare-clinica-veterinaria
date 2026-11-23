import { cookies } from 'next/headers';
import { buildOsmEmbedUrl, buildOsmLink } from '@/domain/map';
import { getConsent } from '@/lib/consent';
import { getPathname } from '@/lib/request';
import { ConsentForm } from './ConsentForm';

// Mapa de OpenStreetMap sujeto a consentimiento (FR-020, R9). Sin consentimiento no hay ninguna
// petición a terceros: se muestra la dirección, un enlace externo y el botón para aceptar.
export async function MapEmbed({
  latitude,
  longitude,
  address,
  small = false,
}: {
  latitude: string | null;
  longitude: string | null;
  address: string;
  small?: boolean;
}) {
  if (latitude === null || longitude === null) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  const consent = getConsent(await cookies());

  if (consent?.third_party) {
    return (
      <iframe
        className={small ? 'map-frame map-frame--sm' : 'map-frame'}
        src={buildOsmEmbedUrl(lat, lng)}
        title={`Mapa de OpenStreetMap con la ubicación: ${address}`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className={small ? 'map-placeholder map-placeholder--sm' : 'map-placeholder'}>
      <p>
        <strong>{address}</strong>
      </p>
      <p>El mapa es de un servicio externo (OpenStreetMap) y solo se carga si lo aceptas.</p>
      <a href={buildOsmLink(lat, lng)} rel="noopener noreferrer" target="_blank">
        Abrir en el mapa<span className="visually-hidden"> (se abre en una ventana nueva)</span>
      </a>
      <ConsentForm returnTo={await getPathname()}>
        <button className="btn" type="submit" name="choice" value="accept">
          Aceptar y ver el mapa
        </button>
      </ConsentForm>
    </div>
  );
}
