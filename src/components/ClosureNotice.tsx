import { formatDayMonth } from '@/domain/time';
import type { Closure } from '@/db/queries/site';

// Aviso de cierres excepcionales vigentes o próximos (FR-019).
export function ClosureNotice({ closures }: { closures: Closure[] }) {
  if (closures.length === 0) return null;
  return (
    <div className="closure-notice" role="note">
      {closures.map((c) => (
        <p key={c.slug}>
          {c.startsOn === c.endsOn
            ? `Cerrado el ${formatDayMonth(c.startsOn)}`
            : `Cerrado del ${formatDayMonth(c.startsOn)} al ${formatDayMonth(c.endsOn)}`}{' '}
          ({c.reason}).
        </p>
      ))}
    </div>
  );
}
