/**
 * npm run demo:seed — cuentas de demostración para la demo en GitHub Codespaces.
 *
 * Crea (o restablece) dos cuentas verificadas con contraseña conocida:
 *   - cliente@example.com — cuenta de cliente con una mascota;
 *   - admin@example.com   — cuenta con el rol del panel /admin (lo da `npm run admin grant`).
 *
 * Después siembra actividad de ejemplo (scripts/demo-activity.ts): citas en la agenda de los
 * próximos días y pedidos en varios estados, para que el panel no se vea vacío.
 *
 * Las contraseñas son públicas (están en el README), así que solo se ejecuta con PETCARE_DEMO=1.
 * Nunca se usa en un despliegue con visitantes reales.
 */
import { loadDotEnv } from './load-env';

loadDotEnv();

if (process.env.PETCARE_DEMO !== '1') {
  console.error('demo:seed solo se ejecuta con PETCARE_DEMO=1 (crea cuentas con contraseñas públicas).');
  process.exit(1);
}

const { eq, inArray } = await import('drizzle-orm');
const { closeDb, getDb } = await import('../src/db/client');
const { customerConsents, customers, legalPages, pets } = await import('../src/db/schema');
const { normalizeEmail } = await import('../src/domain/account-schemas');
const { hashPassword } = await import('../src/lib/auth/password');
const { runAdminCli } = await import('../src/lib/admin/cli');
const { seedAppointments, seedOrders } = await import('./demo-activity');

const DEMO_PASSWORD = 'PetCare-Demo-2026';

const ACCOUNTS = [
  { email: 'cliente@example.com', firstName: 'Lucía', lastName: 'Demo', pet: { name: 'Luna', speciesKey: 'perro', birthDate: '2021-04-12' } },
  { email: 'admin@example.com', firstName: 'Equipo', lastName: 'PetCare', pet: null },
] as const;

async function seed(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const versions = await db
    .select({ kind: legalPages.kind, version: legalPages.version })
    .from(legalPages)
    .where(inArray(legalPages.kind, ['privacidad', 'terminos']));
  const version = (kind: string) => versions.find((v) => v.kind === kind)?.version ?? null;

  let client: { id: string; email: string; firstName: string; lastName: string; petId: string } | null = null;
  for (const account of ACCOUNTS) {
    const emailNormalized = normalizeEmail(account.email);
    const [row] = await db
      .insert(customers)
      .values({
        email: account.email,
        emailNormalized,
        firstName: account.firstName,
        lastName: account.lastName,
        passwordHash,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: customers.emailNormalized,
        set: { passwordHash, emailVerifiedAt: now, updatedAt: now },
      })
      .returning({ id: customers.id });
    const customerId = row!.id;

    const consents = await db.select({ id: customerConsents.id }).from(customerConsents).where(eq(customerConsents.customerId, customerId));
    if (consents.length === 0) {
      await db.insert(customerConsents).values({
        customerId,
        kind: 'privacy_terms',
        privacyVersion: version('privacidad'),
        termsVersion: version('terminos'),
        createdAt: now,
      });
    }

    if (account.pet) {
      const existing = await db.select({ id: pets.id }).from(pets).where(eq(pets.customerId, customerId));
      if (existing.length === 0) await db.insert(pets).values({ customerId, ...account.pet, createdAt: now, updatedAt: now });
      const [pet] = await db.select({ id: pets.id }).from(pets).where(eq(pets.customerId, customerId)).limit(1);
      client = { id: customerId, email: account.email, firstName: account.firstName, lastName: account.lastName, petId: pet!.id };
    }
    console.log(`Cuenta de demo lista: ${account.email}`);
  }

  const code = await runAdminCli(['grant', 'admin@example.com', '--by', 'demo:seed'], (line) => console.log(line), now);
  if (code !== 0) throw new Error('no se ha podido dar el rol de administrador');

  if (client) {
    const booked = await seedAppointments({ ...client, phone: null }, client.petId, new Date());
    console.log(booked > 0 ? `Citas de ejemplo: ${booked}.` : 'Citas de ejemplo: ya había citas, no se añade ninguna.');
    const ordered = await seedOrders(client, new Date());
    console.log(ordered > 0 ? `Pedidos de ejemplo: ${ordered}.` : 'Pedidos de ejemplo: ya había pedidos, no se añade ninguno.');
  }
  console.log(`Contraseña de las dos cuentas: ${DEMO_PASSWORD}`);
}

try {
  await seed();
} catch (error) {
  console.error('No se ha podido sembrar la demo:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
