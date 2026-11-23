import Image from 'next/image';

const PLACEHOLDER = '/media/comun/placeholder-persona.svg';

// Profesional del equipo (FR-017): foto con texto alternativo (o imagen de sustitución), nombre y especialidad.
export function TeamMember({
  name,
  specialty,
  photoPath,
  photoAlt,
}: {
  name: string;
  specialty: string;
  photoPath: string | null;
  photoAlt: string | null;
}) {
  return (
    <article className="member">
      <Image
        className="member__photo"
        src={photoPath ?? PLACEHOLDER}
        alt={photoPath ? (photoAlt ?? `Foto de ${name}`) : `Foto de ${name}`}
        width={600}
        height={600}
        loading="lazy"
        sizes="(max-width: 900px) 100vw, 25vw"
      />
      <div className="member__body">
        <h3>{name}</h3>
        <span className="product__meta">{specialty}</span>
      </div>
    </article>
  );
}
