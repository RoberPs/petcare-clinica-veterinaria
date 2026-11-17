import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrevoProvider } from '@/email/brevo';
import type { AccountEmailContext } from '@/email/templates/account-layout';
import { newsletterConfirmEmail } from '@/email/templates/newsletter-confirm';
import { emailHmac, MissingNewsletterKeyError } from '@/lib/newsletter/hash';
import { confirmTokenHash, newConfirmToken, unsubscribeToken, verifyUnsubscribeToken } from '@/lib/newsletter/tokens';
import { sign } from '@/lib/signing';

// Plantilla newsletter_confirm (contracts/emails.md), tokens de confirmación y de baja (E8, E10),
// huella de la constancia (E7) y cabeceras en Brevo.

const ctx: AccountEmailContext = { clinicName: 'PetCare', demoBannerEnabled: true, siteUrl: 'https://petcare.example' };
const SUB_ID = '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

describe('newsletter_confirm', () => {
  const token = newConfirmToken(new Date('2026-11-17T10:00:00Z'));
  const mail = newsletterConfirmEmail(ctx, {
    email: 'lector@example.test',
    subscriptionId: SUB_ID,
    token: token.token,
    expiresAt: new Date('2026-11-24T10:00:00Z'),
  });

  it('asunto, saludo genérico y destinatario sin nombre', () => {
    expect(mail.subject).toBe('Confirma tu suscripción al boletín de PetCare');
    expect(mail.to).toEqual({ email: 'lector@example.test' });
    expect(mail.text.startsWith('Hola:')).toBe(true);
    // La dirección no se copia en el cuerpo.
    expect(mail.text).not.toContain('lector@example.test');
  });

  it('enlace de confirmación, caducidad en Europe/Madrid y política', () => {
    expect(mail.text).toContain(`https://petcare.example/boletin/confirmar?t=${encodeURIComponent(token.token)}`);
    expect(mail.text).toContain('El enlace caduca el 24/11/2026 11:00.');
    expect(mail.text).toContain('borraremos tu dirección en 30 días');
    expect(mail.text).toContain('https://petcare.example/politica-del-boletin');
    expect(mail.html).toContain('href="https://petcare.example/boletin/confirmar?t=');
  });

  it('pie de baja y cabeceras List-Unsubscribe', () => {
    const t = encodeURIComponent(unsubscribeToken(SUB_ID));
    expect(mail.text).toContain(`Darme de baja: https://petcare.example/boletin/baja?t=${t}`);
    expect(mail.headers).toEqual({
      'List-Unsubscribe': `<https://petcare.example/api/boletin/baja?t=${t}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('aviso de demostración si está activo', () => {
    expect(mail.text).toContain('Esta es una web de demostración');
  });
});

describe('tokens del boletín', () => {
  it('confirmación: 32 bytes en base64url y solo se guarda el hash', () => {
    const now = new Date('2026-11-17T10:00:00Z');
    const t = newConfirmToken(now);
    expect(t.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(confirmTokenHash(t.token)).toBe(t.hash);
    expect(t.expiresAt.getTime() - now.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(confirmTokenHash('corto')).toBeNull();
    expect(confirmTokenHash(undefined)).toBeNull();
  });

  it('baja: firma que se verifica y se rechaza si se manipula', () => {
    const token = unsubscribeToken(SUB_ID);
    expect(verifyUnsubscribeToken(token)).toBe(SUB_ID);
    expect(verifyUnsubscribeToken(token.slice(0, -2) + 'xx')).toBeNull();
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken(null)).toBeNull();
  });

  it('baja: una firma con FORM_SECRET sin derivar (otro propósito) no vale', () => {
    expect(verifyUnsubscribeToken(sign(JSON.stringify({ s: SUB_ID, p: 'newsletter-unsubscribe' })))).toBeNull();
  });
});

describe('huella de la constancia', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('HMAC estable del correo normalizado', () => {
    expect(emailHmac('Lector@Example.test ')).toBe(emailHmac('lector@example.test'));
    expect(emailHmac('lector@example.test')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('error claro si falta NEWSLETTER_HASH_KEY', () => {
    vi.stubEnv('NEWSLETTER_HASH_KEY', '');
    expect(() => emailHmac('lector@example.test')).toThrow(MissingNewsletterKeyError);
  });
});

describe('Brevo con cabeceras', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envía headers en el cuerpo de la API', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: 'm1' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createBrevoProvider({ apiKey: 'k', from: 'PetCare <hola@example.test>', baseUrl: 'http://brevo.test' });
    const result = await provider.send({
      to: { email: 'lector@example.test' },
      subject: 'Asunto',
      text: 'Texto',
      html: '<p>Texto</p>',
      headers: { 'List-Unsubscribe': '<https://x/api>' },
    });
    expect(result.ok).toBe(true);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.headers).toEqual({ 'List-Unsubscribe': '<https://x/api>' });
  });

  it('sin headers no añade el campo', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createBrevoProvider({ apiKey: 'k', from: 'hola@example.test', baseUrl: 'http://brevo.test' });
    await provider.send({ to: { email: 'a@example.test' }, subject: 's', text: 't', html: 'h' });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty('headers');
  });
});
