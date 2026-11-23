// Tipos compartidos de los correos transaccionales.

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface OutgoingEmail {
  to: EmailAddress;
  replyTo?: EmailAddress;
  subject: string;
  text: string;
  html: string;
  /** Cabeceras adicionales (p. ej. List-Unsubscribe del boletín, E10). */
  headers?: Record<string, string>;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  /** true si tiene sentido reintentar (429, 5xx, red o tiempo de espera). */
  retryable: boolean;
  /** Código o estado HTTP. Nunca contiene datos personales. */
  code: string;
}

export interface EmailProvider {
  send(message: OutgoingEmail): Promise<SendResult>;
}

/** Datos de la clínica que necesitan las plantillas. */
export interface EmailClinic {
  name: string;
  inboxEmail: string;
  phoneDisplay: string;
  phoneE164: string;
  responseTimeText: string;
  demoBannerEnabled: boolean;
  hoursSummary: string[];
  privacyUrl: string;
}

/** Datos del mensaje que necesitan las plantillas. */
export interface EmailMessage {
  name: string;
  phone: string | null;
  email: string;
  reasonLabel: string;
  message: string;
  createdAt: Date;
}
