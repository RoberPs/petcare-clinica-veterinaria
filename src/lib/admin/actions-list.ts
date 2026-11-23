// Registro de las Server Actions y páginas del panel (F2, SC-001). Cada acción o página nueva se
// añade aquí: el test tests/integration/admin-authz.test.ts recorre las dos listas y comprueba que
// todas empiezan por `await requireAdmin()` (rechazan a anónimos, clientes y admins sin verificar o
// con el rol retirado, sin ejecutar nada).

export interface AdminActionEntry {
  /** Nombre exportado por el módulo. */
  name: string;
  /** Módulo de la acción, relativo a src/ (alias "@/"). */
  module: string;
  /** Firma: `(form)` o, con useActionState, `(prev, form)`. */
  arity: 1 | 2;
}

export const ADMIN_ACTIONS: readonly AdminActionEntry[] = [
  // US3
  { name: 'saveService', module: 'app/admin/servicios/actions', arity: 2 },
  { name: 'saveStaff', module: 'app/admin/veterinarios/actions', arity: 2 },
  { name: 'saveStaffHours', module: 'app/admin/veterinarios/actions', arity: 2 },
  // US4
  { name: 'cancelAppointmentAdmin', module: 'app/admin/citas/[id]/actions', arity: 1 },
  { name: 'moveAppointmentAdmin', module: 'app/admin/citas/[id]/actions', arity: 1 },
  // US5
  { name: 'saveBlock', module: 'app/admin/bloqueos/actions', arity: 1 },
  { name: 'deleteBlock', module: 'app/admin/bloqueos/actions', arity: 1 },
];

export interface AdminPageEntry {
  path: string;
  /** Módulo de la página, relativo a src/. */
  module: string;
  /** Parámetros dinámicos; ":appointment", ":service", ":staff" y ":block" son ids de ejemplo del test. */
  params?: Record<string, string>;
}

export const ADMIN_PAGES: readonly AdminPageEntry[] = [
  { path: '/admin', module: 'app/admin/page' },
  { path: '/admin/agenda', module: 'app/admin/agenda/page' },
  { path: '/admin/citas/[id]', module: 'app/admin/citas/[id]/page', params: { id: ':appointment' } },
  { path: '/admin/citas/[id]/cancelar', module: 'app/admin/citas/[id]/cancelar/page', params: { id: ':appointment' } },
  { path: '/admin/citas/[id]/mover', module: 'app/admin/citas/[id]/mover/page', params: { id: ':appointment' } },
  { path: '/admin/servicios', module: 'app/admin/servicios/page' },
  { path: '/admin/servicios/nuevo', module: 'app/admin/servicios/nuevo/page' },
  { path: '/admin/servicios/[id]', module: 'app/admin/servicios/[id]/page', params: { id: ':service' } },
  { path: '/admin/veterinarios', module: 'app/admin/veterinarios/page' },
  { path: '/admin/veterinarios/nuevo', module: 'app/admin/veterinarios/nuevo/page' },
  { path: '/admin/veterinarios/[id]', module: 'app/admin/veterinarios/[id]/page', params: { id: ':staff' } },
  { path: '/admin/veterinarios/[id]/horario', module: 'app/admin/veterinarios/[id]/horario/page', params: { id: ':staff' } },
  { path: '/admin/bloqueos', module: 'app/admin/bloqueos/page' },
  { path: '/admin/bloqueos/nuevo', module: 'app/admin/bloqueos/nuevo/page' },
  { path: '/admin/bloqueos/[id]', module: 'app/admin/bloqueos/[id]/page', params: { id: ':block' } },
];
