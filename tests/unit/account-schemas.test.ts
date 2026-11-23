import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_MESSAGES,
  changePasswordSchema,
  deleteAccountSchema,
  emailOnlySchema,
  loginSchema,
  marketingSchema,
  newPasswordSchema,
  normalizeEmail,
  normalizePhone,
  petSchema,
  profileSchema,
  registerSchema,
  validateForm,
} from '@/domain/account-schemas';

const goodRegister = {
  first_name: ' Ana ',
  last_name: 'Prueba Ejemplo',
  email: ' Ana.Prueba@Example.TEST ',
  phone: '',
  password: 'caballo bateria grapa',
  password_confirm: 'caballo bateria grapa',
  accept_terms: 'on',
};

describe('registro', () => {
  it('acepta un alta correcta, recorta los textos y deja la casilla de consejos desmarcada', () => {
    const r = validateForm(registerSchema, goodRegister);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.first_name).toBe('Ana');
    expect(r.data.email).toBe('Ana.Prueba@Example.TEST');
    expect(r.data.phone).toBeNull();
    expect(r.data.marketing_opt_in).toBe(false);
  });

  it('marca el error junto a "Repetir contraseña" y no devuelve las contraseñas', () => {
    const r = validateForm(registerSchema, { ...goodRegister, password_confirm: 'otra cosa distinta' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toEqual({ password_confirm: ACCOUNT_MESSAGES.password_confirm });
    expect(r.values.password).toBeUndefined();
    expect(r.values.password_confirm).toBeUndefined();
    expect(r.values.first_name).toBe(' Ana ');
  });

  it('exige aceptar la privacidad y los términos, y sigue validando la contraseña', () => {
    const r = validateForm(registerSchema, {
      ...goodRegister,
      accept_terms: undefined,
      password: 'corta',
      password_confirm: 'corta',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.accept_terms).toBe(ACCOUNT_MESSAGES.accept_terms);
    expect(r.fieldErrors.password).toBe('Usa al menos 10 caracteres.');
  });

  it('aplica la política de contraseñas con el correo del formulario', () => {
    const r = validateForm(registerSchema, { ...goodRegister, password: 'ana.prueba-2026', password_confirm: 'ana.prueba-2026' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.password).toBe('La contraseña no puede contener tu correo.');
  });

  it('rechaza correos y nombres no válidos', () => {
    const r = validateForm(registerSchema, { ...goodRegister, email: 'no-es-correo', first_name: '   ' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.email).toBe(ACCOUNT_MESSAGES.email);
    expect(r.fieldErrors.first_name).toBe(ACCOUNT_MESSAGES.first_name);
  });

  it('guarda la casilla de consejos solo si viene marcada', () => {
    const r = validateForm(registerSchema, { ...goodRegister, marketing_opt_in: 'on' });
    expect(r.ok && r.data.marketing_opt_in).toBe(true);
  });
});

describe('teléfono', () => {
  it('se valida normalizado (sin espacios, puntos ni guiones) y se guarda tal como se escribió', () => {
    expect(normalizePhone('600 12-34.56')).toBe('600123456');
    for (const phone of ['600 123 456', '+34 600-123-456', '(+34) 600.12.34.56']) {
      const r = validateForm(profileSchema, { first_name: 'Ana', last_name: 'P', phone });
      expect(r.ok, phone).toBe(true);
      if (r.ok) expect(r.data.phone).toBe(phone);
    }
  });

  it('rechaza los que no tienen entre 9 y 15 cifras o llevan letras', () => {
    for (const phone of ['60012345', '6001234567890123', '600 abc 456']) {
      const r = validateForm(profileSchema, { first_name: 'Ana', last_name: 'P', phone });
      expect(r.ok, phone).toBe(false);
      if (!r.ok) expect(r.fieldErrors.phone).toBe(ACCOUNT_MESSAGES.phone);
    }
  });
});

describe('datos personales', () => {
  const base = { first_name: 'Ana', last_name: 'Prueba' };

  it('código postal y localidad van juntos', () => {
    const onlyPostal = validateForm(profileSchema, { ...base, postal_code: '28001' });
    expect(!onlyPostal.ok && onlyPostal.fieldErrors.city).toBe(ACCOUNT_MESSAGES.postal_code_needs_city);
    const onlyCity = validateForm(profileSchema, { ...base, city: 'Madrid' });
    expect(!onlyCity.ok && onlyCity.fieldErrors.postal_code).toBe(ACCOUNT_MESSAGES.city_needs_postal_code);
    const both = validateForm(profileSchema, { ...base, postal_code: '28001', city: 'Madrid', province: '' });
    expect(both.ok).toBe(true);
    if (both.ok) expect(both.data).toMatchObject({ postal_code: '28001', city: 'Madrid', province: null, address_line: null });
  });

  it('exige un código postal de 5 cifras', () => {
    const r = validateForm(profileSchema, { ...base, postal_code: '2800', city: 'Madrid' });
    expect(!r.ok && r.fieldErrors.postal_code).toBe(ACCOUNT_MESSAGES.postal_code);
  });
});

describe('acceso y contraseñas', () => {
  it('inicio de sesión: correo y contraseña obligatorios, "Recordarme" opcional', () => {
    const ok = validateForm(loginSchema, { email: 'a@example.test', password: 'x', remember: 'on' });
    expect(ok.ok && ok.data.remember).toBe(true);
    const bad = validateForm(loginSchema, { email: '', password: '' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors).sort()).toEqual(['email', 'password']);
  });

  it('solo correo', () => {
    expect(validateForm(emailOnlySchema, { email: 'a@example.test' }).ok).toBe(true);
    expect(validateForm(emailOnlySchema, { email: 'a@' }).ok).toBe(false);
  });

  it('nueva contraseña con su repetición y la regla del correo', () => {
    const schema = newPasswordSchema('ana@example.test');
    expect(validateForm(schema, { password: 'caballo bateria grapa', password_confirm: 'caballo bateria grapa' }).ok).toBe(true);
    const r = validateForm(schema, { password: 'soy-ana-y-mas', password_confirm: 'soy-ana-y-mas' });
    expect(!r.ok && r.fieldErrors.password).toBe('La contraseña no puede contener tu correo.');
  });

  it('cambio de contraseña: exige la actual', () => {
    const r = validateForm(changePasswordSchema('ana@example.test'), {
      password: 'caballo bateria grapa',
      password_confirm: 'caballo bateria grapa',
    });
    expect(!r.ok && r.fieldErrors.current_password).toBe(ACCOUNT_MESSAGES.current_password);
  });

  it('eliminar la cuenta exige la contraseña', () => {
    expect(validateForm(deleteAccountSchema, {}).ok).toBe(false);
    expect(validateForm(deleteAccountSchema, { current_password: 'algo' }).ok).toBe(true);
  });

  it('preferencia de consejos', () => {
    expect(validateForm(marketingSchema, {})).toMatchObject({ ok: true, data: { marketing_opt_in: false } });
    expect(validateForm(marketingSchema, { marketing_opt_in: 'on' })).toMatchObject({ ok: true, data: { marketing_opt_in: true } });
  });

  it('normaliza el correo con trim y minúsculas', () => {
    expect(normalizeEmail('  Ana@Example.TEST ')).toBe('ana@example.test');
  });
});

describe('mascota', () => {
  const schema = petSchema(['perro', 'gato'], '2026-11-11');

  it('acepta una especie de la lista y "Otra", que se guarda como null', () => {
    const dog = validateForm(schema, { name: ' Rex ', species: 'perro', birth_date: '2022-08-01' });
    expect(dog).toMatchObject({ ok: true, data: { name: 'Rex', species: 'perro', birth_date: '2022-08-01' } });
    const other = validateForm(schema, { name: 'Pío', species: 'other', birth_date: '2026-11-11' });
    expect(other).toMatchObject({ ok: true, data: { species: null } });
  });

  it('rechaza una especie inexistente', () => {
    const r = validateForm(schema, { name: 'Rex', species: 'dragon', birth_date: '2022-08-01' });
    expect(!r.ok && r.fieldErrors.species).toBe(ACCOUNT_MESSAGES.species);
  });

  it('rechaza fechas futuras, de hace más de 40 años o mal formadas', () => {
    const at = (birth_date: string) => validateForm(schema, { name: 'Rex', species: 'perro', birth_date });
    expect(at('2026-11-12')).toMatchObject({ ok: false, fieldErrors: { birth_date: ACCOUNT_MESSAGES.birth_date_future } });
    expect(at('1986-11-10')).toMatchObject({ ok: false, fieldErrors: { birth_date: ACCOUNT_MESSAGES.birth_date_too_old } });
    expect(at('1986-11-11').ok).toBe(true);
    expect(at('2026-02-30')).toMatchObject({ ok: false, fieldErrors: { birth_date: ACCOUNT_MESSAGES.birth_date } });
    expect(at('')).toMatchObject({ ok: false, fieldErrors: { birth_date: ACCOUNT_MESSAGES.birth_date } });
  });

  it('exige un nombre de 1 a 40 caracteres', () => {
    expect(validateForm(schema, { name: '', species: 'perro', birth_date: '2022-08-01' })).toMatchObject({
      ok: false,
      fieldErrors: { name: ACCOUNT_MESSAGES.pet_name },
    });
    expect(validateForm(schema, { name: 'x'.repeat(41), species: 'perro', birth_date: '2022-08-01' }).ok).toBe(false);
  });
});
