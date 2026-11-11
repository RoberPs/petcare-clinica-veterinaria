// Compatibilidad con la 002: la bandeja de salida generalizada vive en ./outbox.
export {
  ACCOUNT_EMAILS_PER_HOUR,
  enqueueAccountEmail,
  getAccountEmailContext,
  sendAccountEmailsNow,
  type AccountEmailKind,
  type EnqueueResult,
} from './outbox';
