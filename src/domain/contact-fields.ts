// Campos, límites y mensajes del formulario de contacto, sin dependencias (también se usan en el cliente).

export const CONTACT_FIELDS = ['nombre', 'telefono', 'email', 'motivo', 'mensaje', 'privacidad'] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

export const LIMITS = { nombre: 100, telefono: 20, email: 254, mensajeMin: 10, mensajeMax: 2000 } as const;

export const MESSAGES = {
  nombre: 'Escribe tu nombre.',
  telefono: 'Revisa el teléfono: usa solo números, espacios y +.',
  email: 'Escribe un correo válido, por ejemplo nombre@correo.es.',
  motivo: 'Elige un motivo.',
  mensajeMin: 'Escribe tu mensaje (mínimo 10 caracteres).',
  mensajeMax: 'El mensaje no puede superar los 2.000 caracteres.',
  privacidad: 'Para enviar el mensaje tienes que aceptar la política de privacidad.',
} as const;
