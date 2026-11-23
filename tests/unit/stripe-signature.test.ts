import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InvalidSignature, signatureHeader, verifyStripeSignature } from '@/lib/payments/signature';

// Firma del aviso de la pasarela (contracts/payments.md). El secreto se arma por partes: no es real.
const secret = ['whsec', 'pruebas'.repeat(4)].join('_');
const body = '{"id":"evt_1","type":"checkout.session.completed"}';
const now = new Date('2026-11-12T10:00:00Z');
const t = Math.floor(now.getTime() / 1000);
const sig = (payload: string, ts = t) => createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');

describe('verifyStripeSignature', () => {
  it('acepta una firma válida', () => {
    expect(() => verifyStripeSignature(body, `t=${t},v1=${sig(body)}`, secret, now)).not.toThrow();
    expect(() => verifyStripeSignature(body, signatureHeader(body, secret, now), secret, now)).not.toThrow();
  });

  it('rechaza un cuerpo alterado', () => {
    expect(() => verifyStripeSignature(`${body} `, `t=${t},v1=${sig(body)}`, secret, now)).toThrow(InvalidSignature);
  });

  it('rechaza sin v1 o sin cabecera', () => {
    expect(() => verifyStripeSignature(body, `t=${t}`, secret, now)).toThrow(InvalidSignature);
    expect(() => verifyStripeSignature(body, null, secret, now)).toThrow(InvalidSignature);
    expect(() => verifyStripeSignature(body, `t=${t},v0=${sig(body)}`, secret, now)).toThrow(InvalidSignature);
  });

  it('acepta si una de varias firmas v1 es válida', () => {
    expect(() => verifyStripeSignature(body, `t=${t},v1=${'0'.repeat(64)},v1=${sig(body)}`, secret, now)).not.toThrow();
    expect(() => verifyStripeSignature(body, `t=${t},v1=${'0'.repeat(64)},v1=${'1'.repeat(64)}`, secret, now)).toThrow(
      InvalidSignature,
    );
  });

  it('rechaza un t fuera de los 300 s', () => {
    const old = t - 301;
    expect(() => verifyStripeSignature(body, `t=${old},v1=${sig(body, old)}`, secret, now)).toThrow(/expired/);
    const future = t + 301;
    expect(() => verifyStripeSignature(body, `t=${future},v1=${sig(body, future)}`, secret, now)).toThrow(/expired/);
    const edge = t - 300;
    expect(() => verifyStripeSignature(body, `t=${edge},v1=${sig(body, edge)}`, secret, now)).not.toThrow();
  });

  it('una firma con otra longitud o no hexadecimal no rompe la comparación en tiempo constante', () => {
    expect(() => verifyStripeSignature(body, `t=${t},v1=abc`, secret, now)).toThrow(/mismatch/);
    expect(() => verifyStripeSignature(body, `t=${t},v1=zz${sig(body).slice(2)}`, secret, now)).toThrow(/mismatch/);
  });
});
