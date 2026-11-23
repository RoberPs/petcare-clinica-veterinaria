import type { ShopSettings } from '@/db/queries/catalog';

// Aviso "Tienda de demostración" (FR-019b). Con el aviso desactivado no se pinta nada.
export function ShopNotice({ settings }: { settings: Pick<ShopSettings, 'demoNoticeEnabled' | 'demoNoticeText'> | null }) {
  if (!settings?.demoNoticeEnabled || !settings.demoNoticeText) return null;
  return (
    <p className="shop-notice" role="note">
      {settings.demoNoticeText}
    </p>
  );
}
