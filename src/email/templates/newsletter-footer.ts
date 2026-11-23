import { unsubscribeToken } from '@/lib/newsletter/tokens';
import { absoluteUrl, type AccountEmailContext, type Block } from './account-layout';

// Pie común de los correos del boletín (contracts/emails.md, E10): enlace "Darme de baja" y las
// cabeceras List-Unsubscribe de RFC 8058 para la baja de un clic. Sirve para cualquier envío futuro.

export function unsubscribeLinks(ctx: AccountEmailContext, subscriptionId: string): { page: string; oneClick: string } {
  const t = encodeURIComponent(unsubscribeToken(subscriptionId));
  return { page: absoluteUrl(ctx, `/boletin/baja?t=${t}`), oneClick: absoluteUrl(ctx, `/api/boletin/baja?t=${t}`) };
}

export function newsletterFooter(ctx: AccountEmailContext, subscriptionId: string): { blocks: Block[]; headers: Record<string, string> } {
  const links = unsubscribeLinks(ctx, subscriptionId);
  return {
    blocks: [
      { p: 'Si no quieres recibir más correos del boletín, puedes darte de baja en cualquier momento:' },
      { link: { label: 'Darme de baja', href: links.page } },
    ],
    headers: {
      'List-Unsubscribe': `<${links.oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
