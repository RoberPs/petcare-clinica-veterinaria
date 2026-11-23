import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_ACTIONS, ADMIN_PAGES, type AdminPageEntry } from '@/lib/admin/actions-list';
import { createSubmissionToken } from '@/lib/form-token';
import { createAppointment, createBlock, createCustomer, createSessionFor, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Guardia del panel (F2, SC-001, FR-002, FR-003): cada página y cada Server Action de /admin
// rechazan al anónimo (a iniciar sesión), al cliente sin rol, al admin sin verificar y al que ha
// perdido el rol a mitad de sesión (404), sin ejecutar nada. Un admin pasa.

const signals = vi.hoisted(() => {
  class RedirectSignal extends Error {
    constructor(public url: string) {
      super('NEXT_REDIRECT');
    }
  }
  class NotFoundSignal extends Error {
    constructor() {
      super('NEXT_NOT_FOUND');
    }
  }
  return { RedirectSignal, NotFoundSignal, cookie: undefined as string | undefined, pathname: '/admin/agenda' };
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'pc_session' && signals.cookie ? { name, value: signals.cookie } : undefined),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers({ 'x-pathname': signals.pathname, 'x-return-to': signals.pathname }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new signals.RedirectSignal(url);
  },
  notFound: () => {
    throw new signals.NotFoundSignal();
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/server', async (orig) => ({ ...(await orig<object>()), after: () => {} }));

type Outcome = 'login' | 'not_found' | 'passed';

async function outcome(fn: () => Promise<unknown>): Promise<Outcome> {
  try {
    await fn();
    return 'passed';
  } catch (error) {
    if (error instanceof signals.NotFoundSignal) return 'not_found';
    if (error instanceof signals.RedirectSignal) return error.url.startsWith('/iniciar-sesion') ? 'login' : 'passed';
    throw error;
  }
}

function modulePath(module: string): string {
  for (const ext of ['.ts', '.tsx']) {
    const file = resolve('src', `${module}${ext}`);
    if (existsSync(file)) return file;
  }
  throw new Error(`No existe src/${module}`);
}

/** Estado de la base de datos que una acción rechazada no debe cambiar. */
async function snapshot() {
  const [counts] = await q(`SELECT
    (SELECT count(*) FROM admin_audit_log)::int AS audit,
    (SELECT count(*) FROM booking_services)::int AS services,
    (SELECT count(*) FROM team_members)::int AS staff,
    (SELECT count(*) FROM staff_hours)::int AS hours,
    (SELECT count(*) FROM schedule_blocks)::int AS blocks,
    (SELECT count(*) FROM appointment_events)::int AS events,
    (SELECT count(*) FROM email_outbox)::int AS emails,
    (SELECT count(*) FROM appointments WHERE status = 'cancelled')::int AS cancelled`);
  return counts;
}

describe('guardia del panel de administración', () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    const seed = await seedBookingConfig();
    const appt = await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid('2027-01-12', '10:00') });
    ids[':appointment'] = appt.id;
    ids[':service'] = seed.services.consulta;
    ids[':staff'] = seed.staff.nerea;
    ids[':block'] = await createBlock({ kind: 'once', startsAt: madrid('2027-01-13', '10:00'), endsAt: madrid('2027-01-13', '11:00') });
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  const pageProps = (p: AdminPageEntry) => ({
    params: Promise.resolve(Object.fromEntries(Object.entries(p.params ?? {}).map(([k, v]) => [k, ids[v] ?? v]))),
    searchParams: Promise.resolve({}),
  });

  async function callPage(p: AdminPageEntry) {
    signals.pathname = p.path;
    const mod = (await import(/* @vite-ignore */ modulePath(p.module))) as { default: (props: unknown) => Promise<unknown> };
    return mod.default(pageProps(p));
  }

  async function callAction(name: string, module: string, arity: 1 | 2) {
    const mod = (await import(/* @vite-ignore */ modulePath(module))) as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const fn = mod[name];
    if (!fn) throw new Error(`${module} no exporta ${name}`);
    const form = new FormData();
    form.set('id', ids[':appointment']!);
    form.set('submission', createSubmissionToken(new Date(Date.now() - 10_000)));
    return arity === 2 ? fn({ status: 'idle' }, form) : fn(form);
  }

  async function as(kind: 'anonymous' | 'customer' | 'unverified' | 'revoked' | 'admin'): Promise<void> {
    if (kind === 'anonymous') {
      signals.cookie = undefined;
      return;
    }
    const c = await createCustomer({ admin: kind !== 'customer', verified: kind !== 'unverified' });
    // createSessionFor exige una cuenta; la de sin verificar también la tiene, por si acaso.
    signals.cookie = await createSessionFor(c.id);
    if (kind === 'revoked') await q('UPDATE customers SET is_admin = false WHERE id = $1', [c.id]);
  }

  it('el registro tiene páginas y todas las acciones exportadas existen', async () => {
    expect(ADMIN_PAGES.length).toBeGreaterThan(0);
    for (const a of ADMIN_ACTIONS) {
      const mod = (await import(/* @vite-ignore */ modulePath(a.module))) as Record<string, unknown>;
      expect(typeof mod[a.name], `${a.module}#${a.name}`).toBe('function');
    }
  });

  for (const kind of ['anonymous', 'customer', 'unverified', 'revoked'] as const) {
    // Una cuenta sin verificar nunca tiene sesión (feature 002, FR-010): para la guardia es un
    // anónimo y va a iniciar sesión. requireAdmin() además exige el correo verificado.
    const expected: Outcome = kind === 'anonymous' || kind === 'unverified' ? 'login' : 'not_found';

    it(`páginas: ${kind} → ${expected}`, async () => {
      await as(kind);
      for (const p of ADMIN_PAGES) expect(await outcome(() => callPage(p)), p.path).toBe(expected);
    });

    it(`acciones: ${kind} → ${expected}, sin ejecutar nada`, async () => {
      await as(kind);
      const before = await snapshot();
      for (const a of ADMIN_ACTIONS) expect(await outcome(() => callAction(a.name, a.module, a.arity)), a.name).toBe(expected);
      expect(await snapshot()).toEqual(before);
    });
  }

  it('un admin verificado pasa la guardia en todas las páginas y acciones', async () => {
    await as('admin');
    for (const p of ADMIN_PAGES) expect(await outcome(() => callPage(p)), p.path).toBe('passed');
    for (const a of ADMIN_ACTIONS) {
      expect(await outcome(() => callAction(a.name, a.module, a.arity)), a.name).not.toBe('login');
    }
  });

  it('las páginas y acciones del panel llaman a requireAdmin()', async () => {
    const { readFileSync } = await import('node:fs');
    for (const p of ADMIN_PAGES) expect(readFileSync(modulePath(p.module), 'utf8'), p.module).toContain('await requireAdmin()');
    for (const a of ADMIN_ACTIONS) {
      const src = readFileSync(modulePath(a.module), 'utf8');
      const body = src.slice(src.indexOf(`export async function ${a.name}(`));
      const firstStatement = body.slice(body.indexOf('{') + 1).trim();
      expect(firstStatement.startsWith('const admin = await requireAdmin();') || firstStatement.startsWith('await requireAdmin();'), a.name).toBe(true);
    }
  });
});
