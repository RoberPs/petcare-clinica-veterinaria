import { Temporal } from '@js-temporal/polyfill';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { petAge, todayInClinicZone } from '@/domain/pet-age';
import type { Pet } from '@/db/queries/pets';
import { getNow } from '@/lib/clock';
import { readOwnPet } from './pets';

// Ayudas de las páginas de mascotas.

/** Edad de cada mascota con la fecha de hoy en Europe/Madrid. */
export async function withAges<T extends Pick<Pet, 'birthDate'>>(pets: T[]): Promise<(T & { age: string })[]> {
  const today = todayInClinicZone(await getNow());
  return pets.map((p) => ({ ...p, age: petAge(Temporal.PlainDate.from(p.birthDate), today) }));
}

export async function todayIso(): Promise<string> {
  return todayInClinicZone(await getNow()).toString();
}

/** Mascota propia, una sola vez por petición (la piden generateMetadata y la página). */
export const loadOwnPet = cache((customerId: string, petId: string) => readOwnPet(customerId, petId));

/**
 * Ruta SIN página a la que se manda una mascota ajena o inexistente: Next.js responde 404 con la
 * página de "no encontrada" completa también sin JavaScript. Con notFound() dentro de una página
 * dinámica (y htmlLimitedBots), el cuerpo del 404 se deja para el cliente y sin JavaScript no se ve
 * nada; es el mismo problema que resuelve la reescritura de src/middleware.ts en la 001.
 */
export const PET_NOT_FOUND_PATH = '/mi-cuenta/mascota-no-encontrada';

/** Mascota propia o, si no lo es, 404 (A9). */
export async function requireOwnPet(customerId: string, petId: string) {
  const pet = await loadOwnPet(customerId, petId);
  if (!pet) redirect(PET_NOT_FOUND_PATH);
  return pet;
}
