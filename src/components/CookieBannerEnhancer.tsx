'use client';

import { useState, type ReactNode } from 'react';
import { ConsentForm } from './ConsentForm';

// Con JavaScript, el aviso se oculta en cuanto se elige y la página se refresca sin recargar.
export function CookieBannerEnhancer({ returnTo, children }: { returnTo: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <ConsentForm
      returnTo={returnTo}
      onDone={() => {
        setHidden(true);
        document.body.classList.remove('has-cookie-banner');
      }}
    >
      {children}
    </ConsentForm>
  );
}
