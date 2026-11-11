import { describe, expect, it } from 'vitest';
import { buildAccountExport, exportFileName } from '@/domain/account-export';

// Forma del JSON de "Descargar mis datos" (contracts/export-format.md, format_version 1).

// Sin anotar el tipo: así se pueden pasar columnas de más (id, hash…) y comprobar que no se exportan.
const input = {
  controller: { name: 'Responsable de Pruebas', contactEmail: 'derechos@example.test' },
  customer: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'Ana@Example.test',
    firstName: 'Ana',
    lastName: 'Prueba',
    phone: null,
    addressLine: 'Calle Mayor 1',
    postalCode: '28001',
    city: 'Madrid',
    province: null,
    passwordHash: '$argon2id$secreto',
    emailVerifiedAt: new Date('2026-11-01T09:00:00Z'),
    marketingOptIn: true,
    marketingOptInChangedAt: new Date('2026-11-02T09:00:00Z'),
    createdAt: new Date('2026-11-01T08:00:00Z'),
    updatedAt: new Date('2026-11-02T09:00:00Z'),
  },
  consents: [
    { id: 'c1', kind: 'privacy_terms', privacyVersion: '2026-11-11', termsVersion: '2026-11-10', createdAt: new Date('2026-11-01T08:00:00Z') },
    { id: 'c2', kind: 'marketing_opt_in', privacyVersion: null, termsVersion: null, createdAt: new Date('2026-11-02T09:00:00Z') },
  ],
  pets: [
    { id: 'p1', name: 'Toby', speciesKey: 'perro', speciesLabel: 'Perro', birthDate: '2022-08-01', createdAt: new Date('2026-11-01T10:00:00Z'), updatedAt: new Date('2026-11-01T10:00:00Z') },
    { id: 'p2', name: 'Pío', speciesKey: null, speciesLabel: null, birthDate: '2026-06-11', createdAt: new Date('2026-11-01T10:00:00Z'), updatedAt: new Date('2026-11-01T10:00:00Z') },
  ],
};

const now = new Date('2026-11-11T09:15:00Z');

describe('exportación de datos (A11)', () => {
  it('sigue el contrato format_version 1', () => {
    const out = buildAccountExport(input, now);
    expect(out).toEqual({
      format_version: 1,
      exported_at: '2026-11-11T10:15:00+01:00',
      controller: { name: 'Responsable de Pruebas', contact_email: 'derechos@example.test' },
      account: {
        email: 'Ana@Example.test',
        first_name: 'Ana',
        last_name: 'Prueba',
        phone: null,
        address: { line: 'Calle Mayor 1', postal_code: '28001', city: 'Madrid', province: null },
        email_verified_at: '2026-11-01T09:00:00.000Z',
        created_at: '2026-11-01T08:00:00.000Z',
        updated_at: '2026-11-02T09:00:00.000Z',
      },
      communications: { marketing_opt_in: true, changed_at: '2026-11-02T09:00:00.000Z' },
      consents: [
        { kind: 'privacy_terms', privacy_version: '2026-11-11', terms_version: '2026-11-10', at: '2026-11-01T08:00:00.000Z' },
        { kind: 'marketing_opt_in', privacy_version: null, terms_version: null, at: '2026-11-02T09:00:00.000Z' },
      ],
      pets: [
        { name: 'Toby', species: 'Perro', species_key: 'perro', birth_date: '2022-08-01', age_at_export: '4 años', created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-01T10:00:00.000Z' },
        { name: 'Pío', species: 'Otra', species_key: null, birth_date: '2026-06-11', age_at_export: '5 meses', created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-01T10:00:00.000Z' },
      ],
    });
  });

  it('no incluye ids internos, el hash de la contraseña ni nada de seguridad', () => {
    const text = JSON.stringify(buildAccountExport(input, now));
    expect(text).not.toContain('11111111-1111');
    expect(text).not.toContain('argon2');
    expect(text).not.toContain('"id"');
    expect(text).not.toMatch(/token|session|password/i);
  });

  it('el nombre del archivo lleva la fecha de Madrid', () => {
    expect(exportFileName(new Date('2026-11-10T23:30:00Z'))).toBe('mis-datos-2026-11-11.json');
  });
});
