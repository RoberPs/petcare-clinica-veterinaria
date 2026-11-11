import type { EmailAddress, EmailProvider, OutgoingEmail, SendResult } from './types';

// Brevo por API HTTP, sin SDK (R7): POST /v3/smtp/email con la cabecera api-key.

export function parseSender(from: string): EmailAddress {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1]!.trim() || undefined, email: m[2]!.trim() } : { email: from.trim() };
}

export function classifyStatus(status: number): Pick<SendResult, 'ok' | 'retryable'> {
  if (status >= 200 && status < 300) return { ok: true, retryable: false };
  if (status === 429 || status >= 500) return { ok: false, retryable: true };
  return { ok: false, retryable: false };
}

export function createBrevoProvider(options: {
  apiKey: string;
  from: string;
  baseUrl?: string;
  timeoutMs?: number;
}): EmailProvider {
  const baseUrl = (options.baseUrl ?? 'https://api.brevo.com').replace(/\/$/, '');
  const sender = parseSender(options.from);
  return {
    async send(message: OutgoingEmail): Promise<SendResult> {
      const body = {
        sender,
        to: [message.to],
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
      };
      try {
        const res = await fetch(`${baseUrl}/v3/smtp/email`, {
          method: 'POST',
          headers: { 'api-key': options.apiKey, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        });
        const { ok, retryable } = classifyStatus(res.status);
        let providerMessageId: string | undefined;
        if (ok) {
          const json = (await res.json().catch(() => ({}))) as { messageId?: string };
          providerMessageId = json.messageId;
        }
        return { ok, retryable, code: String(res.status), providerMessageId };
      } catch (error) {
        const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
        return { ok: false, retryable: true, code: timeout ? 'timeout' : 'network_error' };
      }
    },
  };
}
