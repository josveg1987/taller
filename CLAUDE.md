# Taller App — presupuestos para talleres de pintura

SaaS multi-taller (cliente-servidor). El primer taller (piloto) es un mini taller de
desabolladura y pintura en Maipú, Santiago de Chile. Después se sumará un taller de mecánica.
Primer módulo: **presupuestos**. Lee `docs/` antes de implementar algo.

## Objetivo del MVP
El dueño crea un presupuesto desde el celular en menos de 5 minutos y se lo envía al cliente
**como PDF por WhatsApp**. Todo lo que no aporte a eso queda fuera del MVP.

## Stack (decidido, no cambiar sin preguntar)
- Monorepo con **npm workspaces** (`apps/api`, `apps/web`, `packages/shared`).
- **API**: NestJS (monolito modular) + PostgreSQL. Empaquetada con Docker.
- **Web**: React + Vite como **PWA** (celular y computador, misma app).
- **BD**: PostgreSQL estándar (local con Docker; en la nube Neon). Sin funciones propias de un proveedor.
- **Archivos**: SDK de S3 contra Cloudflare R2 (portable a AWS S3).
- **PDF**: librería liviana (`pdfmake` o `@react-pdf/renderer`). **Nunca Puppeteer/Playwright**
  (el plan gratis de Render tiene 512 MB).
- Hosting piloto gratis: Render (API) + Neon (BD) + Cloudflare Pages (web) + R2 (archivos).
  Destino futuro posible: AWS (Lightsail). Por eso: Docker, variables de entorno, SQL estándar.
- TypeScript 6 (no 7: `tsup` aún no genera tipos con TS 7). Está fijado en la raíz.

## Reglas de arquitectura
1. **Multi-taller desde el día 1**: toda tabla de negocio lleva `taller_id`. Aislar con Row Level
   Security de PostgreSQL además de filtrar en el código.
   **Cómo se aplica:** la API consulta con el rol `taller_app` (sujeto a RLS) usando
   `DatabaseService.conTaller(tallerId, async (db) => ...)`, que abre una transacción, hace
   `SET LOCAL ROLE taller_app` y fija `app.taller_id`. **Toda consulta de negocio pasa por ahí.** El dueño
   de las tablas (el rol de la conexión) no pasa por RLS: solo para migraciones y tareas administrativas
   (alta de taller, buscar usuario al iniciar sesión). Las llaves foráneas incluyen `taller_id`.
   Toda tabla nueva: `taller_id`, RLS + política `aislamiento`, y `GRANT` explícito a `taller_app`
   (el test de "red de seguridad" falla si se olvida el RLS).
2. **El servidor manda en el cálculo**: la PWA muestra totales en vivo, pero al guardar la API
   recalcula con `@taller/shared` y ese valor es el oficial.
3. **Reglas de cálculo en un solo lugar**: `packages/shared/src/presupuesto.ts`. Deben tener tests.
4. **Las líneas del presupuesto guardan una "foto"** (nombre de pieza y montos) para que cambiar
   tarifas no altere presupuestos pasados ni los reportes.
5. **El PDF no se guarda**: se genera a demanda desde los datos.
6. **Todo lo del negocio es configurable por taller** (tarifa de pintura, margen, regla de anticipo,
   catálogo, condiciones, numeración). Nada de valores fijos pensando solo en el taller piloto.
7. **Monolito modular**, no microservicios. Cada módulo de Nest separado (auth, taller, clientes,
   vehículos, catálogo, presupuestos, pdf). Los rubros (pintura, mecánica) serán módulos aparte
   sobre un núcleo común; no meter `if (rubro === ...)` por todo el código.
8. **Local-first en la PWA (HU-43)**: borradores, catálogo y configuración en IndexedDB (Dexie).
   `localStorage` solo para preferencias. La sesión va en cookie `httpOnly`, nunca en localStorage.
   El servidor es la fuente de verdad. Al cerrar sesión se borran los datos locales.
9. **Al abrir la PWA se llama a `/health`** para despertar a Render (plan gratis se duerme a los 15 min).
10. Montos en **pesos chilenos enteros** (sin decimales). Sin IVA por ahora (el taller solo cotiza).
11. **Usuarios y permisos** (decidido 2026-10-09): hay dos tipos de cuenta. El **administrador de la APP**
    (`administradores_app`, sin taller) tiene control total: talleres, usuarios y los datos de cualquier
    taller (entra a un taller con `sesiones.taller_activo_id`). Los usuarios de taller (`usuarios`) son
    todos **administradores de su taller** (rol `admin_taller`): su taller, su configuración y sus usuarios,
    hasta `talleres.max_usuarios` (por defecto 2; lo valida un trigger en la BD). Las rutas exigen sesión
    por defecto (guard global); `@Publico()` la omite y `@SoloAdminApp()` restringe. Para consultar datos
    de negocio: `@TallerActual() tallerId` + `db.conTaller(tallerId, ...)`. Las contraseñas usan `scrypt`;
    la sesión es una cookie `httpOnly` con token opaco (en la BD solo su hash), así desactivar una cuenta
    o un taller corta la sesión al instante. `taller_app` no puede leer `password_hash` ni `sesiones`.

## Diseño móvil
La app debe sentirse como una app móvil (PWA), no como un sitio web. Reglas para toda pantalla nueva:
- **Mobile-first**: se diseña primero para celular; en computador el contenido se centra y se ensancha
  (columna de `--ancho-max`), sin cambiar la estructura.
- **Navegación en una barra inferior** de 3 a 4 secciones, alcanzable con el pulgar. Lo secundario
  (cuenta, cerrar sesión) va en una hoja, no en la barra.
- **Encabezado con la marca y título grande** al inicio de cada pantalla (`<Encabezado titulo sub atras paso />`:
  degradado azul, logo, avatar de la cuenta, botón volver y, en el asistente, "Paso N de 3"), y **una sola acción
  principal**, ancha (`.boton`), en la **tarjeta flotante** `.flotante` que sube 44 px sobre el encabezado; el resto
  del contenido va en `.cuerpo`. Las demás acciones son secundarias (`.boton.secundario`) o enlaces (`.enlace`);
  la acción destructiva, `.boton.peligro`. Mientras carga una pantalla se usa `<Cargando>` (conserva el encabezado).
  El diseño sale de `prototipoUI/index.html` (referencia visual; no se copia su código).
- **Listas como tarjetas agrupadas** con esquinas redondeadas (`.grupo` > `.item`), no tablas.
- **Selecciones** (pieza, monto, estado, tipo de anticipo) y confirmaciones **en hojas que suben desde
  abajo** (`<Hoja>`), no en `<select>` ni en `window.confirm`.
- **Áreas seguras**: respetar `env(safe-area-inset-*)` arriba, abajo y a los lados (ya incluido en el marco).
- **Táctil**: botones y filas de al menos 48 px (`--toque`); campos de texto de 16 px o más para que iOS no
  haga zoom al enfocar. No bloquear el zoom del usuario.
- **Sin selección de texto ni resaltado azul** en botones y filas tocables; **sin rebote de toda la página**
  (la página no se desplaza: lo hace `.contenido`, con `overscroll-behavior: contain`).
- **Transiciones de 150 a 250 ms** (`--t-rapida`, `--t-media`), respetando `prefers-reduced-motion`.
  Sin librerías de animación.
- **Tipografía del sistema** (`system-ui`). No copiar íconos ni marca de Apple: los íconos son propios y
  genéricos (`Iconos.tsx`).
- **Accesibilidad**: contraste suficiente, foco visible, `aria-current` en la barra, hojas con
  `role="dialog"` y cierre con Escape.
- **Colores, espacios y tamaños siempre como variables CSS** de `:root` en `apps/web/src/styles.css`
  (`--color-*`, `--esp-*`, `--radio-*`, `--toque`, `--t-*`). No escribir valores sueltos en los componentes.
  Pantalla nueva = reutilizar `<Encabezado>`, `.flotante`, `.cuerpo`, `.grupo`, `.item`, `.campo`, `.boton`,
  `.chip` (estado), `.chip-monto` (botón con tinte), `.segmentos`, `<Hoja>` y la barra inferior flotante de
  `Aplicacion.tsx`. Con el asistente (y la vista del PDF) la barra inferior se oculta y aparece `.barra-accion`.
- **Insignias** (`marca/insignias.tsx`): círculo con el logo de la marca del auto (`InsigniaAuto`; logos de
  `simple-icons`, CC0, en `packages/shared/src/autos.ts` con `logoDeMarca()` e `iniciales()`; sin logo → iniciales; sin
  marca → ícono de auto) o con las iniciales del cliente (`InsigniaCliente`). Se usan en las listas de clientes,
  presupuestos, vehículos, en el buscador del paso 1 y en el PDF (recuadro redondeado de cliente y vehículo). Los logos son marcas registradas de los fabricantes: solo identifican el auto del cliente. Faltan Mercedes-Benz,
  Lexus, Jaguar, Land Rover, Alfa Romeo, Dodge y casi todas las chinas (se pueden agregar pegando su trazo en `autos.ts`).
  La foto del auto/cliente queda para la etapa de atención (necesita R2).
- **La marca es el tema del taller**: solo estas variables cambian por taller (`--color-marca-950/900/700`,
  `--color-acento`, `--color-acento-sobre-oscuro`, `--color-tinte`, `--color-tinte-texto`) y el logo sale de
  `useMarca()` (`src/marca.ts`, hoy siempre Vega: logos en `src/marca/vega/`, íconos de la PWA en `public/icons/`).
  Qué pide cada taller nuevo: `docs/marca-por-taller.md`. El botón principal usa el acento (contraste ≥ 4,5:1).
  Bordes de campos `#928C82` (≥ 3:1), algo más oscuros que en el prototipo, por accesibilidad.

## Comandos
```bash
npm install              # instala todo el monorepo
npm run dev:api          # API en http://localhost:3000 (GET /health)
npm run dev:web          # PWA en http://localhost:5173
npm test                 # tests de packages/shared
npm run build            # compila shared, api y web (en ese orden)
npm run db:up            # PostgreSQL local con Docker (requiere Docker Desktop)
npm run db:migrate       # aplica las migraciones SQL pendientes (apps/api/migrations/)
npm run db:rollback      # deshace la última migración
npm run catalogo:generar -- --anio 2027   # regenera el catálogo de vehículos desde el Excel del SII
npm run test:db          # tests de aislamiento entre talleres (necesita la BD local; se niega a correr contra otra)
```
Migraciones: archivos `.sql` con `-- Up Migration` / `-- Down Migration` (`node-pg-migrate`). Crear una nueva:
`npx node-pg-migrate create <nombre> -j sql -m migrations` dentro de `apps/api`. **SQL puro, sin ORM** (decidido).
Primer administrador de la APP: `npm run crear-admin -w @taller/api -- --email <correo> --nombre <nombre>`
(sin `--password` genera una y la muestra una vez; compila la API, no usarlo con `dev:api` corriendo).
Para Neon usar la conexión **directa** (sin `-pooler`): `$env:DATABASE_URL='...'; npm run db:migrate`.
Copia `.env.example` a `.env`. Si no hay `DATABASE_URL`, `/health` responde `db.configured=false`.
Si cambias `packages/shared`, vuelve a compilarlo (`npm run build -w @taller/shared`) o usa
`npm run dev -w @taller/shared` en otra terminal.

## Convenciones
- Idioma de la interfaz y de los textos de usuario: **español de Chile**. Código en inglés o español
  de forma consistente con lo existente (hoy el dominio está en español: `presupuesto`, `pieza`).
- Cambios pequeños y verificables: una funcionalidad por vez, con tests donde haya reglas de negocio.
- No agregar dependencias sin necesidad. No agregar facturación/SII, portal de clientes ni
  módulo de mecánica hasta que se pida (ver "Fuera del MVP").

## Estado actual

**RESUMEN PARA RETOMAR (cierre de sesión 2026-10-10):**
- **PRODUCCIÓN FUNCIONANDO (2026-10-11).** Web https://taller-6hb.pages.dev (Cloudflare Pages), API
  https://taller-api-5n9i.onrender.com (Render), BD Neon (proyecto `taller`, rol `taller_owner`, rama `production`).
  `main` en GitHub = todo lo desarrollado hasta el 2026-10-10 (commit `94ca14c`). Hecho el 2026-10-11 con el dueño del proyecto:
  (1) Cloudflare: `API_URL=https://taller-api-5n9i.onrender.com` y `VITE_API_URL=/api` (primero las puso al revés: ojo) y
  "Retry deployment"; la Pages Function de reenvío `/api/*` funciona de verdad (`/api/health` responde por la web).
  (2) Neon migrada completa (`npm.cmd run db:migrate` con la conexión directa, incluye catálogo de vehículos y plantilla de
  piezas). (3) Administrador de la APP creado con `crear-admin` (clave temporal que cambió al entrar). (4) Contraseña de Neon
  renovada y `DATABASE_URL` (pooled) actualizada en Render: `/health` volvió a `db.ok=true`. (5) Creó "el primer taller" desde el
  panel y lo usó desde el celular (funciona); la PWA se instaló en Android Chrome (tardó un par de minutos en "Instalando…").
  **Lecciones del paso a producción:** en PowerShell los `npm` fallan por la política de scripts → usar `npm.cmd`; la conexión
  directa de Neon (sin `-pooler`) es para migrar/`crear-admin`, la pooled para Render; el diálogo "Reset password" de Neon NO se
  debe descargar como `.env`; Render tarda un par de minutos en reiniciar tras cambiar una variable; la primera carga de la web
  puede tardar ~20-50 s (Render gratis se duerme). Nunca pedir ni pegar en el chat direcciones de conexión ni contraseñas.
  **Pendiente (continuar el 2026-10-12):**
  1. Confirmar con el dueño del proyecto qué quedó creado en producción: taller **Vega** (nombre sugerido "Desabolladura y
     Pintura Vega"), su usuario con clave temporal (se la pasa por WhatsApp) y el **logo del PDF**
     (`vega-logo-pack/vega-logo/logos/svg/horizontal-color-naranja.svg`, versión para fondo claro). Que el taller Vega quede
     limpio (no se puede borrar nada): las pruebas, en otro taller ("Taller Pruebas") al que entra el administrador de la APP.
  2. Probar en el celular el flujo completo: cambiar clave, configurar Mi taller (tarifa, margen, condiciones, transferencia,
     dirección y teléfono), crear un presupuesto, ver el PDF y **compartir por WhatsApp** (`navigator.share` con archivo solo
     existe en celular y nunca se probó).
  3. **Respaldo:** copia manual de Neon con `pg_dump` antes de datos reales y luego copia diaria automática (ver abajo). Neon tiene
     "Backup & Restore" en su menú: revisar qué ofrece el plan gratis.
  4. Mejoras pequeñas acordadas (proponer y esperar OK): botón **"Editar nombre y correo"** del usuario (la API ya lo permite,
     `PATCH /admin/usuarios/:id` y `/taller/usuarios/:id`; falta la pantalla en `GestionUsuarios`) y botón **"Instalar la app"**
     (Android: evento `beforeinstallprompt`; iPhone: instrucciones "Compartir → Añadir a pantalla de inicio"). El nombre bajo el ícono
     es "Presupuestos" y el ícono el de Vega para todos (decidir con el ícono por taller).
  5. Después de publicar: definir con el dueño las **preguntas para el taller** (base en `docs/preguntas-para-el-taller.md`, agregar
     lo que vea en la app) y cómo recibir sus observaciones (WhatsApp o un botón "Enviar comentario"). Límites del piloto a
     avisarle: primera carga lenta, no se pueden borrar clientes/vehículos/presupuestos, no hay "olvidé mi contraseña", sin fotos.
- **Acceso de lectura a producción (2026-10-14):** existe el rol `claude_lectura` en Neon (solo `SELECT`, `BYPASSRLS` para ver
  todos los talleres, `default_transaction_read_only`; sin acceso a `sesiones` ni a `password_hash`; creado por el dueño del
  proyecto en el SQL Editor de Neon). Su dirección **directa** va en `.env.lectura` (variable `DATABASE_URL_LECTURA`; `.gitignore`
  ahora ignora todo `.env.*` salvo `.env.example`). Regla: Claude solo ejecuta consultas de lectura; todo lo que modifique datos
  lo escribe Claude como SQL y lo ejecuta el dueño en el SQL Editor de Neon; no imprimir nunca la dirección; pedir permiso antes
  de mirar datos personales de clientes (para lo técnico bastan conteos y estructura). **Pendiente: renovar la contraseña de
  `claude_lectura`** (quedó escrita en el chat) con `ALTER ROLE claude_lectura WITH PASSWORD '...'` (generada en PowerShell y
  copiada al portapapeles) y actualizar `.env.lectura`.
- **Eliminar presupuestos y filtros (2026-10-14, hecho en local, SIN publicar):** migración `…presupuestos-eliminados`
  (`eliminado_en`, `eliminado_por` NULL si lo hizo el administrador de la APP, índice parcial de vigentes). `DELETE /presupuestos/:id`
  es **lógico** y vale en cualquier estado: lo oculta de lista, detalle, PDF, edición y cambio de estado (404) pero queda
  guardado y su número no se reutiliza. `GET /presupuestos` ahora devuelve `{ presupuestos, hayMas }` y acepta `?q=` (nombre sin
  tildes, parte de la patente o número exacto: `12`, `N° 12`, `#12`), `?estado=` (el vencido se calcula), `?desde=YYYY-MM-DD`,
  `?antes=<número>` (paginación) y `?limite=` (1 a 100, 20 por defecto). Web: la lista tiene buscador, hoja "Filtros" (estado y
  período), "Ver más" y una papelera por fila con confirmación (avisa si el cliente ya lo recibió); el detalle tiene "Eliminar
  presupuesto". **Para publicarlo: migrar Neon primero** (`npm.cmd run db:migrate`, conexión directa) y luego `git push`; el formato de
  la lista cambió, así que API y web deben desplegarse juntas (unos minutos de diferencia pueden dejar la lista vacía). 305 tests.
- **Respaldo (decidido 2026-10-10):** antes de datos reales, copia manual de Neon con `pg_dump` (explicarle los comandos);
  poco después, copia diaria automática con GitHub Actions: `pg_dump` cifrado con clave, guardado en un lugar privado
  (Cloudflare R2; NO como archivo de Actions si el repo es público), últimas 30 copias. Neon gratis solo guarda un historial
  corto de cambios. Hoy no existe `.github/`.
- **Hecho, probado y subido a GitHub:** Fases 1, 1b, 2 (2a a 2d: BD, login, administrador de la APP, administrador
  de taller), 3 (clientes y vehículos), catálogo de vehículos (SII) con sugerencias propias del taller, y 4 (piezas,
  combos, montos rápidos y desabollado sugerido).
- **Hecho y subido (2026-10-11): Fase 5, el presupuesto** (ver detalle abajo). 298 tests de la API (`npm run test:db`)
  + 10 de `shared` (`npm test`).
- **Hecho y subido (2026-10-11): Fase 6, PDF + vista previa + enviar por WhatsApp + estados** (ver detalle abajo).
- **Hecho y subido (2026-10-11): rediseño de la interfaz** según `prototipoUI/` (etapas 1 a 4 del plan: tokens y tema de
  Vega, componentes base y `<Encabezado>`, todas las pantallas migradas, íconos/manifest/`theme-color` `#11223D`). Falta la
  etapa 5 y la revisión final (360/390/1280 px con capturas, hecha en 390 y 1280).
- **Hecho y subido (2026-10-11): preparación para publicar** (2026-10-10). (1) **Contraseña temporal:** columnas
  `usuarios.debe_cambiar_password` y `administradores_app.debe_cambiar_password`; se activan cuando un administrador crea
  una cuenta o le pone clave a otra persona (y en `crear-admin` si la clave la genera el comando) y se apagan cuando la
  persona cambia la suya con `POST /auth/password` (pide la actual, cierra las demás sesiones, con freno de intentos). El
  perfil (`/auth/me`) trae `debeCambiarPassword` y la web muestra `CambiarPasswordObligatorio` antes de la app (el bloqueo
  es solo de la interfaz). La hoja "Cuenta" tiene "Cambiar contraseña". (2) **Administradores de la APP:** `/admin/administradores`
  (listar, crear con clave temporal, activar/desactivar, clave temporal a otro; no a sí mismo), pantalla `/administradores`
  desde la hoja Cuenta (reutiliza `GestionUsuarios`). (3) **Logo en el PDF:** `talleres.logo_claro_svg` (SVG para fondo
  claro), `PUT /admin/talleres/:id/logo` solo para el administrador de la APP (el rol `taller_app` no puede escribir esa
  columna), saneado en `src/marca/svg.ts` (sin scripts, imágenes, enlaces externos ni eventos; máx. 100 KB; con viewBox); el
  PDF lo dibuja (`pdfmake` renderiza bien el logo de Vega) y, sin logo, escribe el nombre; la tarjeta "Logo del PDF" está en
  el detalle del taller. (4) **Taller nuevo:** `ConfiguracionPendiente` en el inicio (tarifa, margen, condiciones,
  transferencia, dirección y teléfono; se puede ocultar) y aviso en el paso 3 si la tarifa de pintura está en $0. El ingreso
  ya tenía freno de intentos (5 fallos por 15 min por IP+correo, en memoria).
- **Siguiente (etapa 5, por taller):** rubro (pintura o mecánica: otra interfaz), logo en SVG (se guardaría como texto en
  la BD, sin R2; sanear el SVG; dos versiones o recolor automático desde los grupos `icono/nombre/eslogan/linea`) y la
  paleta de 2 colores por taller, todo editado solo por el administrador de la APP (ver `docs/marca-por-taller.md`);
  el PDF usaría el logo (`TallerParaPdf` en `pdf.documento.ts`; probar antes que `pdfmake` dibuje bien ese SVG). Después, el
  ícono de instalación por taller (manifest por taller o ícono único del producto: decidir con el dominio).
- **Pendiente para después (decidido 2026-10-10):** "Olvidé mi contraseña" por correo (servicio transaccional por API HTTP,
  p. ej. Resend o Brevo, porque el plan gratis de Render bloquea SMTP; necesita dominio propio verificado; enlace de un solo
  uso que vence en 1 h, guardado con hash, sin revelar si el correo existe, con límite de intentos). Mientras tanto el
  administrador (de la APP o del taller) pone una contraseña temporal y se la pasa por WhatsApp. Eso (que el usuario cambie la
  temporal al entrar, y que el administrador de la APP cambie la suya y cree otros) ya está hecho.
- **Cómo se aplican las migraciones:** a mano (`npm run db:migrate`; en Neon con la conexión directa). Render no las corre
  al desplegar: migrar primero y subir el código después. Una migración nueva de la plantilla de piezas solo llega a los
  talleres que se creen después (a los existentes, con "Agregar las piezas estándar que falten").
  Supuestos a confirmar con el taller piloto: pintura igual por pieza y editable; anticipo de repuestos con el precio
  con margen. Importar el cliente desde la libreta de contactos quedó para después (solo funciona en Android Chrome).
- **Retomar en local:** abrir Docker Desktop → `npm run db:up` → `npm run dev:api` y `npm run dev:web`
  (http://localhost:5173). Cuentas de prueba SOLO en la BD local: administrador de la APP `admin@taller.local` (la
  contraseña la mostró `crear-admin`; si se perdió, crear otra) y taller demo `dueno@taller.local` / `demo-taller-2026`
  (Taller Demo, con clientes, piezas y combos de prueba). También de prueba, solo en la BD local: administrador de la APP
  `prueba-admin@taller.local` / `admin-demo-2026` y un taller "Taller Nuevo NNNNN" con usuario `nuevoNNNNN@taller.local`
  (su clave ya fue cambiada en las pruebas). Hay muchos clientes y presupuestos de prueba (Pedro Prueba, etc.).
  Dev servers: `npm run dev:api` y `npm run dev:web` (no correr `npm run build` de la raíz con la API abierta: la tumba).
- **Cómo trabajar con el dueño del proyecto:** es nuevo en DevOps, explicarle en lenguaje simple; **antes de cambios
  nuevos, proponer y esperar su autorización** (lo pidió explícitamente); no hacer push ni migrar Neon sin que lo pida;
  comandos simples, uno por llamada (menos avisos de permiso).
- **Pendiente fuera del código** (lo hace el dueño): definir en Mi taller la tarifa de pintura, el margen de repuestos,
  los datos de transferencia y las condiciones; y dominio propio + Neon para que producción funcione (ver abajo).

Fase 1 completa y verificada en local (2026-10-08): tests de `shared` pasan (8/8), `npm run build`
compila todo, `/health` responde con `db.ok=true` y la PWA muestra "Conectado". Docker Desktop (WSL 2)
ya está instalado en el equipo de desarrollo y la BD corre con `npm run db:up` (`db:down` conserva los datos).

Fase 1b completa (2026-10-09): publicado y validado desde el celular y el computador.
- Código: https://github.com/josveg1987/taller (rama `main`).
- BD: Neon (proyecto `taller`, Postgres 17, AWS US East 2 Ohio, rama `production`, conexión pooled).
- API: Render, servicio `taller-api` (Docker, Free, región Ohio), https://taller-api-5n9i.onrender.com
  Dockerfile `apps/api/Dockerfile`, contexto `.`, health check `/health`.
  Variables: `DATABASE_URL` (Neon) y `CORS_ORIGIN`.
- Web: Cloudflare Pages, proyecto `taller`, https://taller-6hb.pages.dev
  Build `npm run build -w @taller/shared && npm run build -w @taller/web`, salida `apps/web/dist`.
  Variables: `VITE_API_URL` (URL de Render, sin barra final) y `NODE_VERSION=24`.
- Render y Cloudflare redespliegan solos con cada push a `main`.

**ESTADO DE PRODUCCIÓN:** ver arriba ("PRODUCCIÓN FUNCIONANDO"). Lo que sigue en esta sección es el historial de cómo se llegó ahí.

**(Histórico) Cuándo hacerlo:** estos pasos eran SOLO para el día de publicar (una sola vez, ~30 minutos, se hacen junto al dueño del
proyecto porque usan sus claves). En desarrollo local no cambian nada (la función de reenvío no se usa en local). Es la
fecha límite antes del piloto; conviene adelantarlo si se quiere probar la app en un celular real (en local solo corre
en el computador), por ejemplo al terminar la Fase 5. Hasta entonces la web pública seguirá mostrando el login sin dejar
entrar, y está bien: no hay usuarios reales.

Pasos que se siguieron para dejar producción funcionando (hechos el 2026-10-11, ver arriba):
1. **Sin dominio propio, gratis (decidido 2026-10-10):** el código ya trae una Cloudflare Pages Function
   (`functions/api/[[ruta]].ts` + `functions/_reenviar.ts`, con tests en `apps/api/test/reenviar.test.ts`) que
   reenvía `/api/*` a Render. Así el navegador habla con UN solo sitio (`taller-6hb.pages.dev`), la cookie de sesión
   funciona y Brave no bloquea nada. Falta configurarlo en Cloudflare (proyecto `taller` → Settings → Variables and
   secrets, Production): agregar `API_URL=https://taller-api-5n9i.onrender.com` y cambiar `VITE_API_URL` a `/api`;
   volver a desplegar. `CORS_ORIGIN` de Render deja de importar (mismo origen). La función solo corre en Cloudflare:
   no se pudo probar ahí aún, solo con tests y compilándola con esbuild. Un dominio propio queda como mejora
   opcional (las passkeys quedan atadas a la dirección: si se cambia, se vuelven a registrar).
2. Aplicar migraciones en Neon con la conexión directa (sin `-pooler`):
   `$env:DATABASE_URL='<directa>'; npm run db:migrate` (esto también carga el catálogo de vehículos).
3. Crear el administrador de la APP en Neon (`crear-admin` con la misma `DATABASE_URL`; ver nota de nombres
   con espacios en Windows) y crear el primer taller y su usuario desde el panel.
4. Cambiar la contraseña de la BD de Neon y actualizar `DATABASE_URL` en Render.
Después: passkeys (2e).

**Fase 3 hecha en local (2026-10-10): clientes y vehículos** (HU-01 a 03). API `apps/api/src/clientes/` y
`apps/api/src/vehiculos/` (por `conTaller()`): `GET|POST /clientes` (`?q=` busca por nombre sin tildes, por
dígitos del teléfono o por patente; crear acepta un `vehiculo` en la misma transacción), `GET|PATCH
/clientes/:id`, `POST /vehiculos`, `GET /vehiculos/patente/:patente` (exacta, para el paso 1 del
presupuesto), `GET|PATCH /vehiculos/:id` (incluye cambiar de dueño dentro del taller). Validadores en
`src/validacion.ts`: patente normalizada (`ABCD12`, única por taller), teléfono, RUT con dígito
verificador (se guarda `12345678-5`). Migración `…busqueda-sin-tildes` (extensión estándar `unaccent`;
en Neon se crea sola al migrar). Web `apps/web/src/clientes/` con pestaña **Clientes** (la barra inferior
queda en Inicio · Clientes · Mi taller; "Usuarios" ahora cuelga de Mi taller). 95 tests. Sin borrado de
clientes ni vehículos todavía; falta la pantalla para cambiar el dueño de un vehículo (la API ya lo permite).

**Catálogo de vehículos (2026-10-10)**: marca > modelo > años para sugerir al escribir (en cualquier orden:
marca→año→modelo o marca→modelo→año). Fuente: tasación fiscal de livianos del SII
(https://www.sii.cl/servicios_online/1049-2612.html, `liv<año>.xlsx`; sin motos): 147 marcas, 2.175 modelos,
17.311 combinaciones. El SII trae el modelo con códigos y variantes pegados ("Forester 7300", "118I",
"Sprinter 314 CDI", "Verna CB 1.4 MT Plus"): `limpiarModelo()` en `apps/api/datos/formato.cjs` los une en el modelo
base (conservando los años) y descarta filas sin modelo útil ("DFSK 4533", "1.6"); reglas por marca para BMW y
Mercedes comerciales, con tests. Si aparece otra marca con ruido, agregar su regla ahí y regenerar. Tablas **globales de solo lectura** (`catalogo_marcas`, `catalogo_modelos`,
`catalogo_modelo_anios`, `catalogo_cargas`; sin `taller_id` ni RLS; `taller_app` solo tiene SELECT). Los
vehículos NO apuntan a ellas: guardan marca/modelo/año como texto, así un auto fuera del catálogo se escribe a
mano y cambiar el catálogo no altera lo guardado. API `apps/api/src/catalogo/` (`GET /catalogo/marcas|modelos|anios`,
solo requiere sesión). Web: `clientes/CamposVehiculo.tsx` + `catalogo.ts` (caché en memoria).
**Carga automática en producción:** los datos van en una migración (`…catalogo-vehiculos-sii-2026.cjs`, lee
`apps/api/datos/catalogo-vehiculos-sii-2026.tsv`), así que `npm run db:migrate` contra Neon crea las tablas Y carga
el catálogo, sin ningún paso aparte (idempotente: solo agrega). Actualizar cada enero:
`npm run catalogo:generar -- --anio 2027` (descarga el Excel del SII y genera el TSV; revisar el informe de
siglas) y crear una migración nueva igual a la de 2026 apuntando al TSV nuevo. Los nombres se limpian en
`apps/api/datos/formato.cjs` ("KIA MOTORS"→"Kia", "MERCEDES BENZ"→"Mercedes-Benz"); si algún modelo queda mal
escrito (una sigla como palabra), agregarlo a `SIGLAS_MODELO`. Los modelos del año en curso pueden no estar
hasta la lista siguiente del SII. **Sugerencias propias del taller:** `GET /catalogo/propios` (por `conTaller`) devuelve
las marcas, o los modelos de una marca, que ese taller ya registró en sus vehículos; el formulario las mezcla con las
del catálogo sin repetir lo que el catálogo ya tiene. El catálogo global NO se modifica (decidido: lo nuevo solo se
sugiere dentro del taller que lo escribió, sin aprobación ni promoción). 201 tests.

**Fase 4 hecha en local (2026-10-10): catálogo de piezas, combos y montos rápidos** (HU-16, 33, 38). Dos capas,
igual que el catálogo de vehículos: **plantilla global de solo lectura** (`catalogo_piezas_base` con las 13 piezas
de carrocería, `catalogo_combos_base` con "Lateral completo") y **catálogo propio de cada taller** (`piezas` y
`combos` + `combo_piezas`, con `taller_id` y RLS; reemplazan a la columna `talleres.combos`, ya eliminada). Al crear
un taller el administrador de la APP, `sembrarCatalogo()` (`apps/api/src/piezas/piezas.service.ts`) le copia la
plantilla; `POST /piezas/estandar` agrega las que falten (idempotente: no pisa cambios ni repone piezas que el
taller quitó de un combo). API `apps/api/src/piezas/`: `/piezas` (listar, `?todas=1` incluye inactivas, crear,
editar, `:id/mover` arriba/abajo, `estandar`) y `/combos` (CRUD). Las piezas se desactivan, no se borran; los
combos sí se pueden eliminar (nada los referencia). Un combo guarda solo las piezas: **el lado
(izquierda/derecha) se elige al aplicarlo** en el presupuesto, y solo afecta a las piezas con `usa_posicion`.
`pieza.tarifa_pintura` NULL = usa `talleres.tarifa_pintura` (ahora editable en Mi taller, junto a
`montos_desabollado`, que parten en 30.000/60.000/100.000 y se editan como chips). Web `apps/web/src/piezas/`
(Piezas y Combos, colgando de Mi taller) y `dinero.ts` (`clp()`). **Desabollado:** no tiene tarifa fija (varía con el
daño); cada pieza tiene un `desabollado_sugerido` opcional (NULL = sin sugerencia) con el que **parte** el monto al
reparar la pieza en el presupuesto, editable, además de los montos rápidos del taller (Fase 5: pre-llenar con él). La
plantilla estándar NO trae valores (ni pintura ni desabollado): cada taller pone los suyos. Cada pieza se repara
(pintura + desabollado) o se reemplaza (pintura + repuesto con margen). 224 tests.

**Fase 5 hecha en local (2026-10-10): presupuestos** (HU-05 a 10, 13, 28, 30, 32, 35, 43). Todo presupuesto tiene
cliente y vehículo (mínimo: patente, nombre y teléfono). API `apps/api/src/presupuestos/` (por `conTaller()`):
`GET /presupuestos` (`?estado=`), `GET /presupuestos/:id`, `POST` y `PUT /presupuestos/:id` (solo en borrador). El
cuerpo trae `vehiculoId` o `vehiculo` + (`clienteId` o `cliente`): si la patente es nueva, cliente y vehículo se crean
en la misma transacción. El servidor completa lo que falte (pintura de la pieza o del taller, desabollado sugerido,
margen del taller), **recalcula con `@taller/shared`** (la API ya depende del paquete; en los tests vitest lo toma del
código fuente) y guarda la "foto" de cada línea. Operaciones: `reparar`, `reemplazar` y `libre` (ítem fuera del
catálogo con precio propio). Número con `siguiente_numero_presupuesto()`, vigencia con `validez_dias`, historial de
estados. Web `apps/web/src/presupuestos/`: inicio = lista (`Presupuestos.tsx`, con los borradores sin guardar de este
teléfono), asistente de 3 pasos (`Asistente.tsx`: `PasoVehiculo` busca la patente al escribir, `PasoPiezas` con lado,
combos, rejilla de piezas e ítems libres, `PasoAjustes` con reparar/cambiar, montos rápidos, descuento, notas, resumen y
vista interna), barra fija con el total en vivo, y detalle (`PresupuestoDetalle.tsx`). Los borradores viven en
IndexedDB con Dexie (`local.ts`; editar un presupuesto guardado crea el borrador `editar-<id>`), y piezas, combos y
tarifas quedan en caché para armar sin señal (`datos.ts`); guardar sin señal deja el borrador intacto. Rutas:
`/presupuestos/nuevo`, `/presupuestos/nuevo/vehiculo/<id>` (botón en el detalle del vehículo), `/presupuestos/borrador/<id>`,
`/presupuestos/<id>` y `/presupuestos/<id>/editar`; dentro del asistente se oculta la barra inferior. Falta: cambiar
estado (aceptado/rechazado) desde la pantalla, y el PDF (Fase 6).
**Ajustes tras probarlo (2026-10-10):** (1) el paso 1 es un **buscador único** por patente o nombre (`GET /clientes?q=`,
que ya trae los vehículos de cada cliente): se toca un vehículo para elegirlo, "Otro vehículo" crea un vehículo nuevo
de ese cliente y "Crear cliente nuevo" abre el formulario (con la patente o el nombre ya escritos); si la patente
escrita ya existe, se usa ese vehículo. La ficha del cliente tiene "Nuevo presupuesto" (`/presupuestos/nuevo/cliente/<id>`:
1 vehículo → directo a piezas, 0 → vehículo nuevo, varios → buscador con su nombre). (2) El paso 3 rotula cada valor:
pintura = "Mano de obra y materiales" (se decidió que la pintura debe incluir todos los materiales; falta confirmarlo con el
taller), desabollado = "Mano de obra", repuesto = costo + margen. (3) **Plazo estimado**: columna
`presupuestos.plazo_dias` (migración `…plazo-dias-habiles`, 1 a 365, NULL = sin plazo), un solo plazo total en **días
hábiles**, opcional; se edita en el paso 3 y se ve en el detalle (irá en el PDF). En el borrador local `plazoDias` 0 = sin plazo.
Las dudas para el taller piloto están en `docs/preguntas-para-el-taller.md`.
**Fase 6 hecha en local (2026-10-10): PDF, vista previa, WhatsApp y estados.** API `apps/api/src/pdf/` (módulo aparte):
`GET /presupuestos/:id/pdf` genera el PDF a demanda con `pdfmake` 0.3 (fuente Roboto que trae el paquete; sin Puppeteer,
no se guarda). `pdf.documento.ts` es una función pura que arma el documento A4 (taller, N°, fechas, cliente, vehículo,
tabla de trabajos con precio por línea, subtotal/descuento/total, monto para iniciar, plazo, observaciones, condiciones
y datos de transferencia; **nunca costos ni ganancia**: su tipo de entrada no los tiene) y tiene tests. Estados:
`PATCH /presupuestos/:id/estado` con pasos permitidos borrador → enviado → aceptado/rechazado (y aceptado/rechazado →
enviado para deshacer), con historial; **vencido no se guarda**: un enviado cuya `valido_hasta` ya pasó se muestra como
vencido (en detalle, lista y filtro) y aún se puede aceptar o rechazar. Un presupuesto que ya no es borrador no se edita:
se **duplica** (`/presupuestos/<id>/duplicar`, crea un borrador local sin número). Web: pantalla `VistaPdf.tsx`
(`/presupuestos/<id>/pdf`) que muestra el PDF real, página por página, con `pdfjs-dist` cargado solo ahí (los celulares
no muestran PDFs dentro de la página); botón "Enviar por WhatsApp": en el celular abre la hoja de compartir del sistema
con el archivo (`navigator.share`); en el computador (o si falla) descarga el PDF y abre WhatsApp con el mensaje, y
pregunta "¿Ya se lo enviaste?" para marcarlo Enviado. El detalle tiene "Ver PDF y enviar", "Editar" (borrador),
"Cambiar estado" y "Duplicar como borrador". Falta: logo, colores y datos de pago por taller (ver Siguiente).
**Hecho en local (2026-10-14, SIN publicar): cuentas, servicios, detalle del trabajo y anticipo por presupuesto.** Una sola
migración nueva (`1791600300000_cuentas-detalle-servicios-anticipo`): publicar = migrar Neon primero y luego `git push` (API y
web juntas; ver "Cómo se aplican las migraciones"). (1) **Cuentas para transferir** (`cuentas_bancarias`, API `src/cuentas/`,
pantalla `cuentas/Cuentas.tsx` desde Mi taller): varias por taller, las activas salen en el PDF en el recuadro "DATOS PARA
TRANSFERIR"; `talleres.datos_transferencia` pasó a ser "Notas de pago (opcional)". La dirección y el teléfono van bajo el
logo, con un ícono cada uno (el dueño prefirió eso a un recuadro destacado). (2) **Detalle del trabajo**: textos estándar en `packages/shared/src/detalle-trabajo.ts`, editables por taller
(`talleres.detalle_pintura/detalle_desabollado`, NULL = estándar); el PDF imprime "Qué incluye el trabajo" solo con los bloques
que el presupuesto lleva. (3) **Servicios** (`servicios`, API `src/servicios/`, `servicios/Servicios.tsx`; se siembran con
`sembrarServicios` al crear un taller): en el paso 2 son botones que agregan una línea `libre` con `descripcion` (columna
`presupuesto_lineas.descripcion`) y precio editable en el paso 3. (4) "Para iniciar el trabajo" ahora se llama **Anticipo**.
(5) `presupuestos.solicita_anticipo`: interruptor por presupuesto (parte según la configuración: activo salvo tipo 'ninguno');
apagado, `monto_inicio` = 0 y el PDF no muestra anticipo. 328 tests API + 14 shared.
**Hecho en local (2026-10-14, SIN publicar): plano del auto (paso 2 y PDF).** Migración `1791600400000_zonas-plano-auto`:
`piezas.zona` y `catalogo_piezas_base.zona` (códigos de `ZONAS`, una zona por pieza del taller: índice único `piezas_taller_zona`),
orden de la plantilla según el esquema 1-17 (Alerón y Tolva sin zona, al final; se mantiene "Maleta / portalón") y
`presupuesto_lineas.zona` (foto; las líneas viejas la toman de su pieza). Una zona por lado exige pieza por lado (400).
`packages/shared`: `zonas.ts` (liviano, en el índice) y `@taller/shared/plano` (segunda entrada de tsup; dibujo ~70 KB en
`plano-datos.ts`, GENERADO desde `C:\Users\jose\Desktop\vega-proto` con un script que lee el bloque `/*CARDATA*/` de su
`index.html`; para otro dibujo, ver `vega-proto/HANDOFF.md`). Web: `presupuestos/PlanoAuto.tsx` (carga diferida, vistas
Todo/Arriba/Izq./Der./Frente/Atrás; tocar una zona agrega la pieza en ese lado) arriba del paso 2; la ficha de pieza tiene
"Zona en el dibujo del auto". PDF: bloque "Piezas a trabajar" (solo si alguna línea tiene zona) con las 5 vistas, reparar = franjas
naranjas, cambiar = azul claro, y leyenda. **Diseño del PDF (2026-10-14, propuesta HTML del dueño):** banda
gris claro `#D1D5DB` con franja naranja (alta en la página 1 con el logo para fondo claro, dirección y teléfono con íconos, N° en
naranja y fechas; delgada en las demás con nombre y N°), dibujada en `background` con posición fija → tarjetas Cliente / Vehículo
(fondo suave, borde naranja; insignia de la marca en la del vehículo) → PIEZAS A TRABAJAR (pastillas por tipo, auto en recuadro
redondeado, leyenda con los nombres de las piezas) → DETALLE DEL TRABAJO (Pieza · Trabajo · Precio, filas alternadas) → totales
(TOTAL en caja gris `#D1D5DB`, monto en naranja) → Anticipo y Plazo en cajas punteadas → QUÉ INCLUYE (lista con check) →
Observaciones → Condiciones → Datos para transferir (titular una vez si es el mismo en todas; una tarjeta por cuenta). Colores al
inicio de `pdf.documento.ts` (los de la marca en la app, más `GRIS_ENCABEZADO`, pedido del dueño para encabezados y total).
pdfmake no redondea tablas: los fondos redondeados son `canvas` con `relativePosition` y alto calculado. En `vitest.config.mts` de la API el alias de `@taller/shared/plano` va antes que el
del índice. 335 tests API + 18 shared.
Nota: no correr `npm run build` (raíz) con `dev:api` abierto: borra `apps/api/dist` y la API se cae; usar `-w @taller/web`.
Nota: `TaskStop` sobre `npm run dev:api` deja vivo el proceso de Node en el puerto 3000: matarlo por PID (`netstat -ano`).

Permisos de Claude Code: `.claude/settings.json` lista los comandos de solo lectura, build y tests permitidos
sin preguntar. Usar comandos simples, uno por llamada (los compuestos con `;`/pipes/`foreach` piden permiso).

Pendiente al retomar:
- **Cambiar la contraseña de la BD en Neon** (quedó visible en una captura del chat): Neon > Connect >
  Reset password, y actualizar `DATABASE_URL` en Render.
- Fase 2 completa (detalle de 2a a 2d). **2a** (2026-10-09): migración `1791562700525_modelo-inicial.sql`
  (8 tablas + RLS + rol `taller_app` + numeración por taller), `conTaller()` y 13 tests de aislamiento.
  Regla de trabajo: no hacer push ni migrar Neon sin que el dueño del proyecto lo pida (el push a `main`
  redespliega Render y Cloudflare). El push del 2026-10-09 lo pidió él al cerrar la Fase 2.
  **2b-1 hecha en local** (API de autenticación): migración `1791563400978_usuarios-roles-sesiones.sql`,
  módulo `apps/api/src/auth/` (scrypt, sesiones en BD, guard global, `/auth/login|logout|me`),
  comando `crear-admin` y 38 tests (`npm run test:db`).
  - 2b-2: pantalla de login en la web (`apps/web/src/`: `api.ts`, `sesion.tsx`, `Login.tsx`,
    `Inicio.tsx`). Al abrir llama a `/health` y `/auth/me`; cerrar sesión borra datos locales
    (`datosLocales.ts`). Cuenta de prueba solo en la BD local: `admin@taller.local` (contraseña que mostró
    `crear-admin`; para otra, crear una nueva con ese comando).
  - 2e (después del dominio): passkeys (huella / Face ID). Ver `docs/plan-de-trabajo.md`.
  - Diseño móvil aplicado a todas las pantallas (login, administración, taller): tokens en `styles.css`,
    `Hoja.tsx` (hojas, confirmación, selector) e `Iconos.tsx`; marco con barra inferior en `Aplicacion.tsx`.
    Revisado con capturas en 390 y 1280 px: ningún elemento tocable < 48 px, ningún campo < 16 px, sin
    desborde horizontal.
  - 2c: mantenedores del administrador de la APP. API en `apps/api/src/admin/`
    (`/admin/talleres`, `/admin/usuarios/:id`, `/admin/talleres/:id/entrar`, `/admin/salir-taller`; usa
    `db.admin()` sin RLS a propósito, solo con `@SoloAdminApp()`); pantallas en `apps/web/src/admin/` con
    navegación por hash (`ruta.ts`) y marco en `Aplicacion.tsx`. No hay borrado de talleres ni usuarios:
    solo suspender / desactivar. El correo no puede repetirse entre `usuarios` y `administradores_app`
    (validado en código, no en la BD). 54 tests en total.
  - 2d: administrador de taller. API `apps/api/src/taller/` (`GET|PATCH /taller`,
    `/taller/usuarios`; todo por `conTaller()`, también sirve al admin de la APP una vez "dentro" de un taller)
    y pantallas `apps/web/src/taller/` ("Datos del taller" y "Usuarios", con `usuarios/GestionUsuarios.tsx`
    compartido con el panel de admin). Migración `…permisos-columnas-talleres`: `taller_app` NO puede cambiar
    `max_usuarios` ni `activo` (solo el admin de la APP). Cambiar la propia contraseña pide la actual; un
    usuario no puede desactivarse a sí mismo. Fuera de 2d: el logo (necesita R2; va con el PDF) y la numeración
    editable (la tarifa de pintura, los montos de desabollado y los combos se hicieron en la Fase 4). 72 tests. Cuentas de prueba solo en la BD local:
    `dueno@taller.local` / `demo-taller-2026` (Taller Demo).
- Respaldo diario con GitHub Actions (puede esperar a la Fase 2).
- **Para que el login funcione en producción la web y la API deben verse como un solo sitio:** la cookie de sesión
  no funciona entre `pages.dev` y `onrender.com` (cookies de terceros bloqueadas en Brave/Safari/Chrome) y Brave
  Shields bloquea `onrender.com` (`ERR_BLOCKED_BY_CLIENT`). Se resuelve con la función de reenvío de Cloudflare
  (ver el paso 1 de arriba) o, si se compra un dominio, con `app.` y `api.` bajo el mismo dominio. La cookie es
  `SameSite=Lax`.

Notas del entorno (Windows):
- **En PowerShell usar `npm.cmd` en vez de `npm`** (la política de ejecución bloquea `npm.ps1`). La variable `$env:DATABASE_URL` vale solo en esa ventana: cerrarla o `Remove-Item Env:DATABASE_URL` al terminar.
- La API tarda ~13 s en arrancar. Para probarla desde PowerShell usar `127.0.0.1` en vez de `localhost`
  (`Invoke-RestMethod` a `localhost` puede fallar por IPv6 aunque la API esté bien).
- **No editar archivos con tildes usando `Get-Content`/`Set-Content` de PowerShell 5.1**: lee en ANSI y
  escribe con BOM, y deja el texto como "mÃ¡ximo". Usar siempre la herramienta de edición.
- `npm run crear-admin ... --nombre "Nombre Apellido"` en Windows guarda el nombre con símbolos `^` (cmd.exe
  mastica las comillas). Usar un nombre sin espacios, o ejecutar `node dist/cli/crear-admin.js ...` directo,
  o corregirlo después con SQL. Igual con tildes enviadas por `Invoke-RestMethod`: mandar el cuerpo en UTF-8.
- En desarrollo solo la BD va en Docker; API y web corren directo con `npm run dev:api` / `dev:web`.
