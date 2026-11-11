<!--
Sync Impact Report
==================
Cambio de versión: 1.0.0 → 1.1.0
Motivo (MINOR): se añade el principio VIII (producto real y adaptable a cualquier clínica) y se
amplían el preámbulo, el principio II, el principio VII y la sección de alcance para dejar claro
que la clínica es ficticia pero el producto funciona como el de un negocio real.

Principios modificados:
- II. Marca propia y contenido real — la ficción afecta solo a los datos, no al funcionamiento.
- VII. Pagos solo en modo de pruebas — integración completa; el modo es configuración.
- Añadido: VIII. Producto real y adaptable a cualquier clínica (NO NEGOCIABLE)

Secciones modificadas: preámbulo; Alcance y restricciones del producto; Flujo de desarrollo y
puertas de calidad (criterio de terminado).

Secciones eliminadas: ninguna.

TODOs diferidos: ninguno.

--- Historial ---
1.0.0 (2026-11-10): primera ratificación.
Principios (plantilla → nuevo título):
- [PRINCIPLE_1_NAME] → I. Design system como única fuente visual (NO NEGOCIABLE)
- [PRINCIPLE_2_NAME] → II. Marca propia y contenido real
- [PRINCIPLE_3_NAME] → III. Tests de flujos críticos (NO NEGOCIABLE)
- [PRINCIPLE_4_NAME] → IV. Privacidad (RGPD) y seguridad (NO NEGOCIABLE)
- [PRINCIPLE_5_NAME] → V. Accesibilidad WCAG 2.2 AA (NO NEGOCIABLE)
- Añadido: VI. Rendimiento y Core Web Vitals
- Añadido: VII. Pagos solo en modo de pruebas (NO NEGOCIABLE)

Secciones añadidas:
- Alcance y restricciones del producto (antes [SECTION_2_NAME])
- Flujo de desarrollo y puertas de calidad (antes [SECTION_3_NAME])

Secciones eliminadas: ninguna.

Plantillas dependientes (.specify/templates/*): no se modifican en este comando; leen la
constitución en tiempo de ejecución.
  ⚠ plan-template.md — la "Constitution Check" debe evaluarse contra los principios I–VII.
  ⚠ tasks-template.md — las tareas de tests de flujos críticos (principio III) son obligatorias.

TODOs diferidos: ninguno.
-->

# Constitución de la web de Clínica Veterinaria

Web de una clínica veterinaria ficticia en España, concebida como demo de portfolio y replicable
por cliente. La clínica es ficticia, pero el producto no: MUST funcionar de punta a punta como el de
un negocio real y poder adaptarse a cualquier clínica veterinaria sin cambiar código. Incluye web pública, consejos de salud, tienda online, reserva de citas, área de
cliente y panel de administración. Idioma de la web y de todo texto visible: español. Moneda: EUR.

## Core Principles

### I. Design system como única fuente visual (NO NEGOCIABLE)

- Toda la interfaz (web pública, área de cliente y panel de administración) MUST usar únicamente
  las variables de `design/tokens.css` y las clases de `design/styles.css`.
- `design/tokens.css` es la única fuente de verdad: está PROHIBIDO escribir a mano colores,
  familias o tamaños tipográficos, radios, sombras, espaciados, duraciones o curvas de animación.
  Cualquier valor visual nuevo se añade primero como token.
- Si falta un componente, se añade a `design/styles.css` usando exclusivamente tokens; no se crean
  estilos en línea ni hojas paralelas que dupliquen o sobrescriban componentes existentes.
- Las páginas HTML de `design/` definen la estructura y el contenido esperado de cada pantalla;
  una pantalla nueva sin referencia en `design/` MUST componerse con los componentes existentes.
- Los CTA siguen su intención de color: **cian** (`--color-sky`) = pedir cita; **menta**
  (`--color-mint`) = acción positiva o éxito; **rosa** (`--color-pink`) = contacto; **ámbar** =
  campañas; **marino** (`--color-navy`) = acción primaria neutra. Ningún color de CTA se usa con
  otra intención.
- Se respetan las convenciones de `design/README.md`: texto y titulares en `--color-navy` sobre
  `--color-bg`, tarjetas blancas; titulares semibold (600) con interlineado 1.2 y cuerpo 14–16 px
  con interlineado 1.5; radio 12 px en botones, chips e inputs y 24 px en tarjetas e imágenes;
  chips en mayúsculas; secciones que alternan `--color-bg` → `--color-sky-light` → `--color-navy`;
  breakpoint móvil de 900 px; orden de la cabecera (Tratamientos · La clínica · Nuestros productos
  · Consejos de salud · Preguntas frecuentes | Mi cuenta · Pide cita · Contacto · Carrito, siempre
  al final); cabecera y pie compartidos según `design/layout.js`.

Justificación: una única fuente de tokens garantiza coherencia visual y permite rebrandear la demo
para cada cliente cambiando solo `tokens.css`.

### II. Marca propia y contenido real

- Está PROHIBIDO usar el logo, las imágenes, los iconos, los textos o el nombre de AniCura, así
  como cualquier material de `design/reference/` en producción.
- Los emojis, degradados e imágenes SVG de `design/` son marcadores de posición y MUST sustituirse
  por recursos propios antes de publicar.
- Los textos, cifras, precios, horarios, nombres de equipo y demás datos de ejemplo de `design/`
  no se publican como contenido real; el contenido se gestiona como datos (semillas o panel de
  administración) y es configurable por cliente (nombre de la clínica, contacto, dirección).
- Al ser una clínica ficticia, ningún dato publicado puede inducir a pensar que es una clínica
  real ni suplantar a una existente. La ficción se limita a los datos de la clínica de demo: el
  funcionamiento MUST ser el de un producto real (principio VIII).

Justificación: evita infringir marcas registradas y asegura que la demo sea replicable.

### III. Tests de flujos críticos (NO NEGOCIABLE)

- Los flujos críticos MUST tener tests automáticos: registro e inicio de sesión, reserva de cita,
  checkout y pago (en modo de pruebas) y cambios de estado de pedido.
- Una feature que toque cualquiera de estos flujos no se da por terminada hasta que sus tests
  existan y pasen en local y en CI.
- Un fallo de estos tests bloquea la integración en la rama principal; no se desactivan ni se
  marcan como omitidos para desbloquear un merge.
- Las reglas de acceso (principio IV) y las comprobaciones de accesibilidad (principio V) de esos
  flujos forman parte de sus tests.

Justificación: son los recorridos donde un fallo cuesta dinero, citas o confianza del cliente.

### IV. Privacidad (RGPD) y seguridad (NO NEGOCIABLE)

- Minimización: solo se recogen los datos personales imprescindibles para cada finalidad, y cada
  campo de formulario justifica su finalidad en la spec.
- Cookies no esenciales y recursos de terceros (analítica, mapas, fuentes externas, vídeos) se
  cargan solo tras consentimiento explícito; rechazar MUST costar lo mismo que aceptar (mismo
  nivel, mismo número de clics, misma prominencia visual). El consentimiento se puede revisar y
  retirar en cualquier momento.
- El usuario puede exportar sus datos en un formato legible por máquina y borrar su cuenta desde
  el área de cliente.
- Autenticación segura: contraseñas con hash robusto y sal (p. ej. Argon2id o bcrypt), sesiones
  en cookies `HttpOnly`, `Secure` y `SameSite`, protección CSRF y limitación de intentos.
- Ningún secreto (claves, tokens, contraseñas, credenciales de pasarela) se guarda en el
  repositorio; se usan variables de entorno y un `.env.example` sin valores reales.
- Autorización en servidor: cada usuario accede únicamente a sus propios datos (mascotas, citas,
  pedidos); el panel de administración exige rol de administrador comprobado en cada petición.
- Toda entrada se valida en servidor y toda salida se escapa.

Justificación: la web trata datos personales en la UE y debe cumplir RGPD y LOPDGDD por diseño.

### V. Accesibilidad WCAG 2.2 AA (NO NEGOCIABLE)

- Todas las pantallas, incluidos el área de cliente y el panel de administración, MUST cumplir
  WCAG 2.2 nivel AA.
- Todo es operable con teclado, con foco visible y orden lógico; los objetivos táctiles respetan
  el tamaño mínimo de WCAG 2.2.
- El contraste de texto y componentes cumple AA; si un token no lo cumple en un uso concreto, se
  corrige el token o se usa otro, nunca un color escrito a mano.
- Todo campo de formulario tiene etiqueta asociada; los errores se describen en texto claro en
  español, junto al campo y anunciados a tecnologías de asistencia.
- La navegación completa (incluido el menú) está disponible y es usable en móvil.
- Se respeta `prefers-reduced-motion`: sin animaciones ni transiciones no esenciales cuando está
  activo.

Justificación: la clínica atiende a cualquier persona y la accesibilidad es un requisito legal y
de calidad.

### VI. Rendimiento y Core Web Vitals

- Las páginas MUST mantener buenos Core Web Vitals (LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 en el
  percentil 75).
- Objetivo verificable: Lighthouse Rendimiento ≥ 90 en móvil en la página de inicio y en el
  catálogo de productos.
- Imágenes con dimensiones explícitas, formatos modernos y carga diferida fuera de la primera
  pantalla; JavaScript mínimo en páginas públicas; recursos de terceros diferidos y sujetos al
  consentimiento del principio IV.

Justificación: la mayoría de visitas llegan desde móvil y el rendimiento afecta a conversión y SEO.

### VII. Pagos solo en modo de pruebas (NO NEGOCIABLE)

- La pasarela de pago MUST configurarse exclusivamente en modo de pruebas (claves de test); está
  prohibido usar o almacenar claves de producción.
- Los datos de tarjeta nunca pasan por los servidores ni la interfaz propios: los gestiona la
  pasarela externa, como indica `design/checkout.html`.
- La interfaz indica claramente que los pagos son de demostración.
- La integración de pago MUST estar completa como en producción: confirmación verificada en
  servidor (webhooks firmados), pagos fallidos o cancelados, reembolsos e idempotencia. El modo
  (pruebas o real) y las claves son configuración, nunca código; activar el modo real para una
  clínica concreta exige una enmienda de esta constitución para ese despliegue.

Justificación: es una demo de portfolio; no debe procesar dinero real, pero el flujo tiene que
estar listo para hacerlo.

### VIII. Producto real y adaptable a cualquier clínica (NO NEGOCIABLE)

- Funcionalidad real, no maqueta: cada pantalla y flujo MUST funcionar de punta a punta con datos
  persistentes y lógica de negocio completa. Quedan prohibidos botones sin acción, formularios que
  no envían, datos simulados en el frontend o flujos que se detienen a medias.
- Reglas de negocio completas: disponibilidad real de citas (horarios, festivos, duración por
  servicio, sin solapamientos ni doble reserva), stock, precios e IVA, ciclo de vida del pedido,
  cancelaciones y devoluciones, correos transaccionales (confirmaciones, recordatorios,
  recuperación de contraseña) y gestión de todos los casos de error y vacíos.
- El panel de administración MUST permitir gestionar sin tocar código todo lo que una clínica
  necesita en su día a día: servicios, horarios y cierres, agenda de citas, catálogo y stock,
  pedidos y sus estados, artículos de consejos, preguntas frecuentes, equipo y datos de la clínica.
- Adaptable a cualquier veterinaria: nombre, logotipo, datos legales y de contacto, dirección,
  horarios, servicios, especies atendidas, catálogo, textos legales, opciones de envío y de pago,
  y la identidad visual (vía `design/tokens.css`) son configuración o datos. Ningún dato de una
  clínica concreta MUST estar escrito en el código.
- Poner en marcha una clínica nueva MUST requerir solo configuración y carga de datos, con un
  procedimiento documentado y reproducible (variables de entorno, datos iniciales, tokens de marca).
- Calidad de producción: errores registrados y sin exponer detalles internos al usuario,
  migraciones de base de datos versionadas, copias de seguridad y páginas legales (aviso legal,
  privacidad, cookies, condiciones de venta) adaptables por clínica.

Justificación: el valor del portfolio es demostrar un producto que cualquier clínica podría usar
mañana; una demo que solo aparenta funcionar no lo demuestra.

## Alcance y restricciones del producto

- Módulos: web pública (inicio, tratamientos, la clínica, contacto, preguntas frecuentes),
  consejos de salud (artículos), tienda online (catálogo, producto, carrito, checkout), reserva
  de citas, área de cliente (mascotas, citas, pedidos) y panel de administración.
- Idioma: todo texto visible, mensajes de error, correos y metadatos en español de España.
- Moneda: EUR, con formato español (`1.234,56 €`), IVA incluido en precios mostrados.
- Fechas, horas y zona horaria: formato español y `Europe/Madrid`.
- Replicable por cliente: todo lo específico de una clínica es configuración o datos, nunca
  valores fijos en el código (detalle en el principio VIII).
- Tipografía: `--font-family` (Figtree sustituye a la tipografía propietaria); cambiar de fuente
  solo requiere cambiar el token. Si se carga desde un tercero, aplica el principio IV.

## Flujo de desarrollo y puertas de calidad

- Desarrollo dirigido por especificación con Spec Kit: `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`; cada plan incluye una comprobación explícita contra
  los principios I–VIII y justifica cualquier excepción.
- Cada spec de UI referencia la página correspondiente de `design/` y los componentes de
  `design/styles.css` que usa.
- Una feature está terminada solo cuando: funciona de punta a punta con datos persistentes y es
  gestionable desde el panel si su contenido lo requiere; no contiene datos de una clínica
  concreta en el código; los tests de flujos críticos afectados pasan; no hay
  valores visuales escritos a mano fuera de `tokens.css`; se ha verificado accesibilidad (teclado
  y comprobación automática) en las pantallas tocadas; no hay secretos en el diff; y, si afecta a
  inicio o catálogo, Lighthouse móvil ≥ 90.
- La CI ejecuta lint, tests y comprobación de secretos en cada cambio; un fallo bloquea el merge.
- Las revisiones de código verifican el cumplimiento de esta constitución.

## Governance

- Esta constitución prevalece sobre cualquier otra práctica, guía o preferencia del proyecto.
  En caso de conflicto entre una spec, un plan o una tarea y la constitución, gana la constitución.
- Enmiendas: se proponen por escrito con motivo e impacto, se actualizan este documento y su
  Sync Impact Report, y se revisan las specs y planes afectados.
- Versionado semántico: MAJOR para eliminar o redefinir principios de forma incompatible; MINOR
  para añadir principios o secciones o ampliar materialmente las reglas; PATCH para aclaraciones
  y redacción.
- Cumplimiento: cada plan pasa la "Constitution Check" antes del diseño y de nuevo tras él; toda
  excepción se documenta en la tabla de complejidad del plan con su justificación y alternativa
  descartada.
- Guía de diseño en tiempo de ejecución: `design/README.md`.

**Version**: 1.1.0 | **Ratified**: 2026-11-10 | **Last Amended**: 2026-11-10
