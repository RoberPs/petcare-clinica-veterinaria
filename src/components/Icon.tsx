import Image from 'next/image';

export type IconName =
  | 'productos'
  | 'tratamientos'
  | 'consejos'
  | 'ubicacion'
  | 'horario'
  | 'telefono'
  | 'correo'
  | 'cita'
  | 'carrito';

// Iconos SVG propios (sustituyen a los emojis de las maquetas). Siempre decorativos.
export function Icon({ name, size = 20, className = 'icon-inline' }: { name: IconName; size?: number; className?: string }) {
  return <Image src={`/media/icons/${name}.svg`} alt="" width={size} height={size} className={className} aria-hidden="true" />;
}
