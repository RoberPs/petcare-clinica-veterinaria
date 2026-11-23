// Franja de demostración (FR-007a): discreta, permanente y sin tapar el contenido.
export function DemoBanner({ enabled, clinicName }: { enabled: boolean; clinicName: string }) {
  if (!enabled) return null;
  return (
    <p className="demo-banner" role="note">
      Web de demostración: {clinicName} es una clínica ficticia
    </p>
  );
}
