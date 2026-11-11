import { existsSync } from 'node:fs';

// Los scripts de npm leen .env si existe (Next.js lo hace solo; tsx no). Las variables ya definidas mandan.
export function loadDotEnv(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
