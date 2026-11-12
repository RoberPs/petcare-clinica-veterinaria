'use client';

import { useEffect, useRef } from 'react';

const PENDING_TEXT = 'Has cambiado la fecha. Pulsa «Ver horas» para ver las horas libres de ese día.';

interface Props {
  /** Fecha de las horas pintadas (AAAA-MM-DD). */
  date: string;
  /** id del formulario de las horas, que se oculta mientras la fecha no coincide. */
  hoursFormId: string;
  /** id del aviso (role="status") que pide pulsar "Ver horas". */
  messageId: string;
}

// Mejora con JavaScript del paso de fecha y hora: si el calendario ya no coincide con el día de las
// horas pintadas, se ocultan esas horas para no reservar en otro día. No envía el formulario al
// cambiar la fecha (sería un cambio de contexto al escribir, WCAG 3.2.2): se sigue pulsando
// "Ver horas", igual que sin JavaScript (B5).
export function SlotDateGuard({ date, hoursFormId, messageId }: Props) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const input = marker.current?.closest('form')?.querySelector<HTMLInputElement>('input[name="fecha"]');
    const message = document.getElementById(messageId);
    if (!input || !message) return;
    const hours = document.getElementById(hoursFormId);

    const sync = () => {
      const pending = input.value !== date;
      if (hours) hours.hidden = pending;
      message.hidden = !pending;
      message.textContent = pending ? PENDING_TEXT : '';
    };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    sync();
    return () => {
      input.removeEventListener('input', sync);
      input.removeEventListener('change', sync);
    };
  }, [date, hoursFormId, messageId]);

  return <span ref={marker} hidden />;
}
