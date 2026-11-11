// Iconos propios de las especies (A10), en lugar de los emojis de las maquetas. Las especies son datos
// de la clínica: las claves que no tienen icono propio usan la huella genérica. Son decorativos
// (aria-hidden): la especie siempre se escribe al lado.

const PATHS: Record<string, string> = {
  // Perro: cabeza con orejas caídas.
  perro:
    'M14 14c-4 0-7 4-7 10 0 3 2 4 4 3l2-1v6c0 6 5 10 11 10s11-4 11-10v-6l2 1c2 1 4 0 4-3 0-6-3-10-7-10-2 0-4 1-5 2h-10c-1-1-3-2-5-2Z M19 25h.01 M29 25h.01 M21 32c2 2 4 2 6 0',
  // Gato: cabeza con orejas en punta.
  gato: 'M10 8l6 9h16l6-9v18c0 9-6 14-14 14S10 35 10 26Z M18 26h.01 M30 26h.01 M22 32h4 M24 32v2 M6 30h8 M34 30h8',
  // Conejo: orejas largas.
  conejo:
    'M18 20c-3-4-4-10-2-14 3 0 5 6 5 12 M30 20c3-4 4-10 2-14-3 0-5 6-5 12 M12 31c0-7 5-12 12-12s12 5 12 12-5 11-12 11-12-4-12-11Z M19 30h.01 M29 30h.01 M22 35c1 1 3 1 4 0',
  // Hurón: cuerpo alargado.
  huron:
    'M6 30c0-4 3-7 7-7h14c6 0 10-4 15-4 0 4-3 9-9 11l-4 1H13c-4 0-7 3-7 6 M10 27h.01 M17 32v6 M29 31v7 M42 19c2-1 3-3 3-5',
  // Ave: pájaro posado.
  ave: 'M30 10c-5 0-8 4-8 8v3L8 30c4 4 10 6 16 6 8 0 14-6 14-14v-4l5-2-5-2c-1-2-4-4-8-4Z M31 16h.01 M18 36l-2 6 M26 36l1 6',
};

/** Huella genérica para "Otra" y para cualquier especie sin icono propio. */
const PAW = 'M24 26c-6 0-11 5-11 10 0 3 2 5 5 5 2 0 4-1 6-1s4 1 6 1c3 0 5-2 5-5 0-5-5-10-11-10Z M12 22a3 4 0 1 0 0.01 0Z M19 14a3 4 0 1 0 0.01 0Z M29 14a3 4 0 1 0 0.01 0Z M36 22a3 4 0 1 0 0.01 0Z';

export function PetIcon({ speciesKey }: { speciesKey: string | null }) {
  const d = (speciesKey && PATHS[speciesKey]) || PAW;
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
