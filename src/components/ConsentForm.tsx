'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';

// Formulario de consentimiento (POST /api/consent). Sin JavaScript es un POST normal con redirección
// 303; con JavaScript se envía con fetch y la página se refresca sin recargar (FR-035 y FR-038).
export function ConsentForm({
  returnTo,
  className,
  children,
  onDone,
}: {
  returnTo: string;
  className?: string;
  children: ReactNode;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (!submitter?.value) return; // sin botón identificado, que actúe el navegador
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    const data = new FormData(form);
    data.set('choice', submitter.value);
    try {
      const res = await fetch('/api/consent', { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      onDone?.();
      router.refresh();
    } catch {
      // Si falla el fetch, se envía como un formulario normal con la misma elección.
      const choice = document.createElement('input');
      choice.type = 'hidden';
      choice.name = 'choice';
      choice.value = submitter.value;
      form.append(choice);
      form.submit();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="post" action="/api/consent" className={className} onSubmit={onSubmit} aria-busy={busy}>
      <input type="hidden" name="return_to" value={returnTo} />
      {children}
    </form>
  );
}
