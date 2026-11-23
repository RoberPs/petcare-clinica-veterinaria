// Límites de los campos de la cuenta, sin dependencias: los usan también los componentes de cliente
// (atributos maxLength y minLength) sin arrastrar Zod ni Temporal al navegador.

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const ACCOUNT_LIMITS = {
  firstName: 80,
  lastName: 80,
  email: 254,
  phone: 30,
  addressLine: 120,
  city: 80,
  province: 80,
  petName: 40,
  petMaxAgeYears: 40,
} as const;
