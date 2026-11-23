import { describeWhen } from '@/domain/availability';

interface Props {
  serviceName: string;
  staffName: string;
  petName: string;
  petSpeciesLabel: string;
  startsAt: Date;
}

// Datos de una cita (confirmación de cancelar o cambiar, enlace de gestión).
export function AppointmentDetails(a: Props) {
  const when = describeWhen(a.startsAt);
  return (
    <dl className="appointment-details">
      <dt>Servicio</dt>
      <dd>{a.serviceName}</dd>
      <dt>Profesional</dt>
      <dd>{a.staffName}</dd>
      <dt>Mascota</dt>
      <dd>
        {a.petName} ({a.petSpeciesLabel})
      </dd>
      <dt>Fecha</dt>
      <dd>{when.longDate}</dd>
      <dt>Hora</dt>
      <dd>{when.time}</dd>
    </dl>
  );
}
