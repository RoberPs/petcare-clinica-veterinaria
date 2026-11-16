// Estado del formulario de /finalizar-compra (useActionState). Los resultados que redirigen
// (pasarela, confirmación o vuelta al carrito) no llegan aquí: la acción hace 303.

export type CheckoutFormState =
  | { status: 'idle' }
  | { status: 'invalid'; fieldErrors: Record<string, string>; values: Record<string, string>; token?: string }
  | { status: 'rate_limited'; retryMinutes: number; values: Record<string, string>; token?: string }
  | { status: 'limit_reached'; values: Record<string, string>; token?: string }
  | { status: 'expired'; values: Record<string, string>; token: string }
  | { status: 'error'; values: Record<string, string>; token?: string };

export const CHECKOUT_IDLE: CheckoutFormState = { status: 'idle' };
