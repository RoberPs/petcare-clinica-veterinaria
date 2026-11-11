import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Hash de contraseñas con Argon2id (A1), con los parámetros mínimos de OWASP. El hash se guarda en
// formato PHC, que incluye la sal y los parámetros: se pueden subir más adelante sin migrar.

export const ARGON2_PARAMS = {
  // Algorithm.Argon2id (es un const enum: con isolatedModules se usa su valor).
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

/** Parámetros de un hash PHC ("$argon2id$v=19$m=19456,t=2,p=1$…"), o null si no se reconoce. */
function phcParams(stored: string): { algorithm: string; m: number; t: number; p: number } | null {
  const match = stored.match(/^\$(argon2(?:id|i|d))\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/);
  if (!match) return null;
  return { algorithm: match[1]!, m: Number(match[2]), t: Number(match[3]), p: Number(match[4]) };
}

/** true si el hash guardado usa otro algoritmo o parámetros más bajos que los actuales. */
export function needsRehash(stored: string): boolean {
  const p = phcParams(stored);
  if (!p) return true;
  return (
    p.algorithm !== 'argon2id' ||
    p.m < ARGON2_PARAMS.memoryCost ||
    p.t < ARGON2_PARAMS.timeCost ||
    p.p < ARGON2_PARAMS.parallelism
  );
}

export interface VerifyResult {
  ok: boolean;
  /** Solo tiene sentido si ok: hay que guardar un hash nuevo con los parámetros actuales. */
  needsRehash: boolean;
}

export async function verifyPassword(stored: string, password: string): Promise<VerifyResult> {
  try {
    const ok = await verify(stored, password);
    return { ok, needsRehash: ok && needsRehash(stored) };
  } catch {
    // Hash corrupto o de otro formato: se trata como contraseña incorrecta.
    return { ok: false, needsRehash: false };
  }
}

// Hash ficticio, calculado una vez por proceso, para que verificar un correo inexistente tarde lo
// mismo que uno real (A1) y el tiempo de respuesta no revele si la cuenta existe.
let dummyHash: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  return dummyHash;
}

/** Verifica contra el hash ficticio. Siempre devuelve false. */
export async function verifyAgainstDummy(password: string = ''): Promise<false> {
  await verifyPassword(await getDummyHash(), password);
  return false;
}
