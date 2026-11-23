import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingSteps } from '@/components/BookingSteps';
import { BookingSummary, type SummaryRow } from '@/components/BookingSummary';
import { Breadcrumb } from '@/components/Breadcrumb';
import { DetailsStep, type DetailsCustomer, type TakenSlots } from '@/components/DetailsStep';
import { ServiceStep } from '@/components/ServiceStep';
import { SlotPicker } from '@/components/SlotPicker';
import { bookingWindow, longDateLabel } from '@/domain/availability';
import { NO_PREFERENCE, OTHER_PET, parseBookingQuery } from '@/domain/booking-schemas';
import { addDays } from '@/domain/time';
import { getBookingConfig } from '@/db/queries/booking-config';
import { listPets } from '@/db/queries/pets';
import { listSpecies } from '@/db/queries/species';
import { getOptionalCustomer, loginUrl } from '@/lib/auth/require-customer';
import { accountPhone } from '@/lib/booking/book';
import { nextDateWithSlots, slotsForDay } from '@/lib/booking/slots';
import { bookingHref } from '@/lib/booking/urls';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { confirmAppointment } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const config = await getBookingConfig();
  const name = config?.site.clinic.name ?? '';
  return {
    title: 'Pide cita',
    description: `Pide cita online en ${name}: elige servicio, profesional, día y hora, con disponibilidad real.`,
    alternates: { canonical: '/pide-cita' },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Reserva en tres pasos (B5): los pasos 1 y 2 son GET con el estado en la query; el 3 es un POST a
// la Server Action. El resumen está siempre visible (FR-008).
export default async function BookingPage({ searchParams }: { searchParams: SearchParams }) {
  const [config, now, customer, sp] = await Promise.all([
    getBookingConfig(),
    getNow(),
    getOptionalCustomer(),
    searchParams,
  ]);
  const reservas = config?.site.sections.find((s) => s.key === 'reservas');
  if (!config || !reservas?.href) notFound();

  // Feature 007 (FR-017): ningún servicio activo tiene un veterinario reservable con horario.
  if (config.services.length === 0) {
    return (
      <>
        <section className="page-hero page-hero--compact">
          <div className="container">
            <Breadcrumb current="Pide cita" />
            <h1>Pide cita online</h1>
          </div>
        </section>
        <div className="container">
          <div className="empty-state">
            <p>Ahora no hay citas online disponibles. Escríbenos o llámanos y te buscamos un hueco.</p>
            <Link prefetch={false} className="btn btn--pink" href="/contacto">
              Contacta con la clínica
            </Link>
          </div>
        </div>
      </>
    );
  }

  const { clinic } = config.site;
  const { today, lastDay } = bookingWindow(now, config.rules);
  const q = parseBookingQuery(sp, { services: config.services, staff: config.staff, today, lastDay });
  const errors: Record<string, string | undefined> = { ...q.errors };
  const service = q.service;
  const staffSlug = q.staff?.slug ?? NO_PREFERENCE;

  // ?mascota= solo se usa si la mascota es del cliente; si no, se ignora en silencio (US2).
  const pets = customer ? await listPets(customer.id) : [];
  const selectedPet =
    q.pet === OTHER_PET && customer ? OTHER_PET : (pets.find((p) => p.id === q.pet)?.id ?? null);
  const petParam = selectedPet;

  const step = q.step;
  let date: string | null = null;
  let slots: string[] = [];
  let nextDate: string | null = null;
  let taken: TakenSlots | null = null;
  if (step >= 2 && service) {
    const staffId = q.staff?.id ?? null;
    date =
      q.date ??
      (errors.fecha
        ? null
        : ((await nextDateWithSlots(config, { service, staffId, now, from: today })) ?? today));
    if (date) {
      slots = (await slotsForDay(config, { service, staffId, date, now })).map((s) => s.time);
      if (slots.length === 0)
        nextDate = await nextDateWithSlots(config, { service, staffId, now, from: addDays(date, 1) });
    }
    // Una hora que ya no está libre: el paso 3 se pinta con las horas libres dentro del formulario
    // (B5), también al volver de un POST sin JavaScript. Si no tiene formato de hora, al paso 2.
    if (step === 3 && !slots.includes(q.time ?? '')) {
      taken = {
        date: date!,
        dayLabel: longDateLabel(date!),
        slots: slots.map((time) => ({ time })),
        nextHref: nextDate
          ? bookingHref({
              servicio: service.slug,
              profesional: staffSlug,
              fecha: nextDate,
              mascota: petParam,
            })
          : null,
        nextLabel: nextDate ? longDateLabel(nextDate) : null,
      };
    }
  }

  const step1Href = bookingHref({ servicio: service?.slug, mascota: petParam });
  const step2Href = service
    ? bookingHref({ servicio: service.slug, profesional: staffSlug, fecha: date, mascota: petParam })
    : undefined;
  const currentHref = bookingHref({
    servicio: service?.slug,
    profesional: step >= 2 ? staffSlug : null,
    fecha: q.date,
    hora: step === 3 ? q.time : null,
    mascota: petParam,
  });
  const pet = pets.find((p) => p.id === selectedPet);

  const rows: SummaryRow[] = [
    {
      label: 'Servicio',
      value: service ? `${service.name} (${service.durationMinutes} min)` : null,
      changeHref: step1Href,
    },
    {
      label: 'Profesional',
      value: step >= 2 ? (q.staff?.name ?? 'Sin preferencia') : null,
      changeHref: step1Href,
    },
    { label: 'Mascota', value: pet ? `${pet.name} (${pet.speciesLabel ?? 'Otra'})` : null },
    { label: 'Fecha', value: step === 3 && date ? longDateLabel(date) : null, changeHref: step2Href },
    { label: 'Hora', value: step === 3 && !taken ? q.time : null, changeHref: step2Href },
  ];

  const staffOptions = config.staff.filter((m) => !service || service.staffIds.includes(m.id));
  let detailsCustomer: DetailsCustomer | null = null;
  if (customer && step === 3) {
    detailsCustomer = {
      name: `${customer.firstName} ${customer.lastName}`,
      email: customer.email,
      phone: accountPhone(customer),
      pets: pets.map((p) => ({ id: p.id, name: p.name, speciesLabel: p.speciesLabel ?? 'Otra' })),
      selectedPet,
    };
  }

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <Breadcrumb current="Pide cita" />
          <h1>Pide cita online</h1>
        </div>
      </section>
      <div className="container cart-layout">
        <div className="account-main">
          <BookingSteps current={step} hrefs={{ 1: step1Href, 2: step2Href }} />
          {step === 1 ? (
            <ServiceStep
              services={config.services.map((s) => ({
                slug: s.slug,
                name: s.name,
                durationMinutes: s.durationMinutes,
              }))}
              staff={staffOptions.map((m) => ({ slug: m.slug, name: m.name }))}
              selectedService={service?.slug ?? null}
              selectedStaff={q.staff?.slug ?? null}
              pet={petParam}
              errors={errors}
            />
          ) : null}
          {step === 2 && service ? (
            <section className="panel" aria-labelledby="paso-fecha">
              <h2 id="paso-fecha">2. Fecha y hora</h2>
              <SlotPicker
                action="/pide-cita"
                hidden={{ servicio: service.slug, profesional: staffSlug, mascota: petParam }}
                date={date ?? q.date ?? today}
                min={today}
                max={lastDay}
                errors={errors}
                slots={slots}
                dayLabel={date ? longDateLabel(date) : ''}
                selected={q.time}
                nextHref={
                  nextDate
                    ? bookingHref({
                        servicio: service.slug,
                        profesional: staffSlug,
                        fecha: nextDate,
                        mascota: petParam,
                      })
                    : null
                }
                nextLabel={nextDate ? longDateLabel(nextDate) : null}
                submitLabel="Continuar"
              />
            </section>
          ) : null}
          {step === 3 && service && date && q.time ? (
            <DetailsStep
              key={`${date}-${q.time}-${selectedPet ?? ''}`}
              action={confirmAppointment}
              token={createSubmissionToken()}
              choice={{ servicio: service.slug, profesional: staffSlug, fecha: date, hora: q.time }}
              species={await listSpecies()}
              customer={detailsCustomer}
              loginHref={loginUrl(currentHref)}
              otherPetHref={bookingHref({
                servicio: service.slug,
                profesional: staffSlug,
                fecha: date,
                hora: q.time,
                mascota: OTHER_PET,
              })}
              phoneDisplay={clinic.phoneDisplay}
              phoneE164={clinic.phoneE164}
              today={today}
              taken={taken}
            />
          ) : null}
        </div>
        <BookingSummary
          rows={rows}
          footer={
            <>
              Te enviaremos los datos de la cita por correo. Si tienes alguna pregunta,{' '}
              <Link prefetch={false} href="/contacto">
                escríbenos
              </Link>{' '}
              o llama al <a href={`tel:${clinic.phoneE164}`}>{clinic.phoneDisplay}</a>.
            </>
          }
        />
      </div>
    </>
  );
}
