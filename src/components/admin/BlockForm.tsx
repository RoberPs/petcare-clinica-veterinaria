import Link from 'next/link';
import { BLOCK_FIELDS, BLOCK_REASON_MAX } from '@/domain/admin-schemas';
import { describeWhen } from '@/domain/availability';
import type { AffectedAppointment } from '@/lib/admin/blocks';
import { describedBy, FieldError } from '../FormParts';

// Formulario de un bloqueo en dos pasos y sin JavaScript (F10):
//  1. "Revisar" es un GET a la misma página con los datos del bloqueo (sin datos personales).
//  2. La confirmación reenvía los datos ocultos al POST, con la lista de citas afectadas y la
//     decisión (sin opción preseleccionada) si las hay.

type Raw = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const many = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const LABELS: Record<string, string> = {
  scope: 'Ámbito',
  staff_id: 'Veterinario',
  kind: 'Tipo',
  start_date: 'Fecha de inicio',
  start_time: 'Hora de inicio',
  end_date: 'Fecha de fin',
  end_time: 'Hora de fin',
  from_date: 'Desde',
  until_date: 'Hasta',
  weekdays: 'Días de la semana',
  weekly_start: 'Hora de inicio',
  weekly_end: 'Hora de fin',
  reason: 'Motivo interno',
};

function Summary({ errors }: { errors: Record<string, string> }) {
  const fields = Object.keys(errors);
  if (fields.length === 0) return null;
  return (
    <div className="form-summary" role="alert" tabIndex={-1}>
      <p>Revisa {fields.length === 1 ? 'este campo' : `estos ${fields.length} campos`}:</p>
      <ul>
        {fields.map((f) => (
          <li key={f}>
            <a href={`#campo-${f}`}>
              {LABELS[f] ?? f}: {errors[f]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field(props: { name: string; label: string; type: string; values: Raw; errors: Record<string, string>; min?: string; max?: string; maxLength?: number }) {
  const { name, label, type, values, errors } = props;
  return (
    <div className={errors[name] ? 'field field--invalid' : 'field'}>
      <label htmlFor={`campo-${name}`}>{label}</label>
      <input
        id={`campo-${name}`}
        name={name}
        type={type}
        defaultValue={one(values[name])}
        min={props.min}
        max={props.max}
        maxLength={props.maxLength}
        step={type === 'time' ? 300 : undefined}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={describedBy(name, errors)}
      />
      <FieldError name={name} errors={errors} />
    </div>
  );
}

export function BlockEditStep(props: {
  action: string;
  values: Raw;
  errors: Record<string, string>;
  staff: { id: string; name: string }[];
  today: string;
}) {
  const { values, errors, staff, today } = props;
  const scope = one(values.scope) || 'staff';
  const kind = one(values.kind) || 'once';
  const weekdays = new Set(many(values.weekdays));
  return (
    <form className="panel form" method="get" action={props.action} noValidate>
      <Summary errors={errors} />
      {one(values.id) ? <input type="hidden" name="id" value={one(values.id)} /> : null}
      <input type="hidden" name="revisar" value="1" />
      <fieldset className="choice-list" aria-describedby={describedBy('scope', errors)}>
        <legend>Ámbito</legend>
        <label>
          <input type="radio" name="scope" value="staff" defaultChecked={scope === 'staff'} />
          <span>Un veterinario</span>
        </label>
        <label>
          <input type="radio" name="scope" value="clinic" defaultChecked={scope === 'clinic'} />
          <span>Toda la clínica</span>
        </label>
        <FieldError name="scope" errors={errors} />
      </fieldset>
      <div className={errors.staff_id ? 'field field--invalid' : 'field'}>
        <label htmlFor="campo-staff_id">Veterinario (si bloqueas a uno)</label>
        <select id="campo-staff_id" name="staff_id" defaultValue={one(values.staff_id)} aria-describedby={describedBy('staff_id', errors)}>
          <option value="">Elige un veterinario</option>
          {staff.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <FieldError name="staff_id" errors={errors} />
      </div>
      <fieldset className="choice-list" aria-describedby={describedBy('kind', errors)}>
        <legend>Tipo de bloqueo</legend>
        <label>
          <input type="radio" name="kind" value="once" defaultChecked={kind === 'once'} />
          <span>Puntual (vacaciones, formación…)</span>
        </label>
        <label>
          <input type="radio" name="kind" value="weekly" defaultChecked={kind === 'weekly'} />
          <span>Se repite cada semana (un descanso…)</span>
        </label>
        <FieldError name="kind" errors={errors} />
      </fieldset>
      <fieldset className="schedule-grid">
        <legend>Si es puntual</legend>
        <div className="schedule-grid__range">
          <Field name="start_date" label="Fecha de inicio" type="date" min={today} values={values} errors={errors} />
          <Field name="start_time" label="Hora de inicio" type="time" values={values} errors={errors} />
          <Field name="end_date" label="Fecha de fin" type="date" min={today} values={values} errors={errors} />
          <Field name="end_time" label="Hora de fin" type="time" values={values} errors={errors} />
        </div>
      </fieldset>
      <fieldset className="schedule-grid">
        <legend>Si se repite cada semana</legend>
        <div className="schedule-grid__range">
          <Field name="from_date" label="Desde" type="date" values={values} errors={errors} />
          <Field name="until_date" label="Hasta" type="date" min={today} values={values} errors={errors} />
          <Field name="weekly_start" label="Hora de inicio" type="time" values={values} errors={errors} />
          <Field name="weekly_end" label="Hora de fin" type="time" values={values} errors={errors} />
        </div>
        <fieldset className="choice-list" aria-describedby={describedBy('weekdays', errors)}>
          <legend>Días de la semana</legend>
          {DAYS.map((d, i) => (
            <label key={d}>
              <input type="checkbox" name="weekdays" value={String(i + 1)} defaultChecked={weekdays.has(String(i + 1))} />
              <span>{d}</span>
            </label>
          ))}
          <FieldError name="weekdays" errors={errors} />
        </fieldset>
      </fieldset>
      <Field name="reason" label="Motivo interno (no lo ven los clientes)" type="text" maxLength={BLOCK_REASON_MAX} values={values} errors={errors} />
      <div className="form-actions">
        <button className="btn" type="submit">
          Revisar
        </button>
        <Link prefetch={false} className="btn btn--ghost" href="/admin/bloqueos">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

export function BlockConfirmStep(props: {
  action: (form: FormData) => Promise<void>;
  editHref: string;
  values: Raw;
  summary: string;
  affected: AffectedAppointment[];
  submissionToken: string;
}) {
  const { values, affected } = props;
  return (
    <form className="panel form" action={props.action}>
      {BLOCK_FIELDS.flatMap((f) => many(values[f]).map((v, i) => <input key={`${f}-${i}`} type="hidden" name={f} value={v} />))}
      <input type="hidden" name="submission" value={props.submissionToken} />
      {affected.map((a) => (
        <input key={a.id} type="hidden" name="affected_ids" value={a.id} />
      ))}
      <h2>Revisa el bloqueo</h2>
      <p>{props.summary}</p>
      {affected.length === 0 ? (
        <p>No hay citas confirmadas en ese periodo.</p>
      ) : (
        <>
          <p>
            {affected.length === 1
              ? 'Hay 1 cita confirmada que quedaría dentro del bloqueo:'
              : `Hay ${affected.length} citas confirmadas que quedarían dentro del bloqueo:`}
          </p>
          <ul className="agenda-list">
            {affected.map((a) => {
              const w = describeWhen(a.startsAt);
              return (
                <li key={a.id} className="agenda-slot">
                  <span className="agenda-slot__time">
                    <time dateTime={a.startsAt.toISOString()}>
                      {w.longDate}, {w.time}
                    </time>
                  </span>
                  <span>
                    {a.serviceName} · {a.petName} · {a.staffName}
                  </span>
                </li>
              );
            })}
          </ul>
          <fieldset className="choice-list">
            <legend>¿Qué hacemos con esas citas?</legend>
            <label>
              <input type="radio" name="decision" value="keep" required />
              <span>Mantenerlas (quedan fuera de horario)</span>
            </label>
            <label>
              <input type="radio" name="decision" value="cancel_all" required />
              <span>Cancelarlas todas y avisar a los clientes</span>
            </label>
          </fieldset>
        </>
      )}
      <div className="form-actions">
        <button className="btn" type="submit">
          Guardar bloqueo
        </button>
        <Link prefetch={false} className="btn btn--ghost" href={props.editHref}>
          Cambiar los datos
        </Link>
      </div>
    </form>
  );
}
