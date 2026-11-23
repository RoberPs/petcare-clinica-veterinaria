import { NO_PREFERENCE } from '@/domain/booking-fields';
import type { RescheduleView } from '@/lib/booking/reschedule-view';
import { fieldId } from './FormParts';
import { SlotPicker } from './SlotPicker';

interface Props {
  view: RescheduleView;
  /** Ruta de los formularios GET (la propia página de cambiar). */
  path: string;
  /** Server Action que confirma el cambio. */
  action: (form: FormData) => Promise<void>;
  /** Campo oculto que identifica la cita: { cita: id } o { token }. */
  identity: Record<string, string>;
}

// Paso de fecha y hora con el servicio fijo y selector de profesional (FR-024). Sin JavaScript:
// el profesional y la fecha se cambian con GET ("Ver horas") y la hora se confirma con POST.
export function RescheduleStep({ view, path, action, identity }: Props) {
  const href = (fecha: string) =>
    `${path}?${new URLSearchParams({ profesional: view.staffSlug, fecha }).toString()}`;
  return (
    <section className="panel" aria-labelledby="paso-cambiar">
      <h2 id="paso-cambiar">Elige la nueva fecha y hora</h2>
      <p className="product__meta">
        {view.service.name} ({view.service.durationMinutes} min). Ahora: {view.current.longDate} a las{' '}
        {view.current.time}.
      </p>
      <SlotPicker
        action={path}
        hidden={{}}
        extraFields={
          <div className="field">
            <label htmlFor={fieldId('profesional')}>Veterinario/a</label>
            <select id={fieldId('profesional')} name="profesional" defaultValue={view.staffSlug}>
              <option value={NO_PREFERENCE}>Sin preferencia</option>
              {view.staffOptions.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        }
        date={view.date}
        min={view.today}
        max={view.lastDay}
        errors={view.errors}
        slots={view.slots}
        dayLabel={view.dayLabel}
        selected={view.selected}
        nextHref={view.nextDate ? href(view.nextDate) : null}
        nextLabel={view.nextLabel}
        submitLabel="Cambiar la cita"
        postAction={action}
        postHidden={{ ...identity, profesional: view.staffSlug }}
      />
    </section>
  );
}
