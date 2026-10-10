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
- **Título grande** al inicio de cada pantalla y **una sola acción principal**, ancha (`.boton`). Las demás
  acciones son secundarias (`.boton.secundario`) o enlaces (`.enlace`); la acción destructiva, `.boton.peligro`.
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
  Pantalla nueva = reutilizar `.grupo`, `.item`, `.campo`, `.boton`, `.chip`, `<Hoja>` y la barra inferior de
  `Aplicacion.tsx`.

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
- **Hecho, probado y subido a GitHub:** Fases 1, 1b, 2 (2a a 2d: BD, login, administrador de la APP, administrador
  de taller), 3 (clientes y vehículos), catálogo de vehículos (SII) con sugerencias propias del taller, y 4 (piezas,
  combos, montos rápidos y desabollado sugerido). 224 tests de la API (`npm run test:db`) + 8 de `shared` (`npm test`).
- **Siguiente: Fase 5, el presupuesto** (HU-05 a 10, 13, 28, 30, 32, 35, 43): flujo de 3 pantallas (patente → piezas →
  ajustar), lado elegido una vez, combos, reparar/reemplazar por pieza, desabollado pre-llenado con el sugerido de la
  pieza, total en vivo con `@taller/shared`, el servidor recalcula, numeración, vista interna, borradores locales.
  Luego Fase 6 (PDF + compartir por WhatsApp + logo con R2). Supuestos a confirmar con el taller piloto: pintura igual
  por pieza y editable; anticipo de repuestos con el precio con margen.
- **Retomar en local:** abrir Docker Desktop → `npm run db:up` → `npm run dev:api` y `npm run dev:web`
  (http://localhost:5173). Cuentas de prueba SOLO en la BD local: administrador de la APP `admin@taller.local` (la
  contraseña la mostró `crear-admin`; si se perdió, crear otra) y taller demo `dueno@taller.local` / `demo-taller-2026`
  (Taller Demo, con clientes, piezas y combos de prueba).
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

**ESTADO DE PRODUCCIÓN (2026-10-10, al cerrar la sesión):** todo el código hasta la Fase 4 está en `main`, así que
Render y Cloudflare publican la versión nueva, **pero producción NO funciona para iniciar sesión**: (1) las
migraciones **no se han aplicado en Neon** (no existen usuarios, sesiones, clientes, catálogos ni
administradores allá), (2) no hay ningún administrador de la APP en Neon, y (3) la cookie de sesión no se
envía entre `pages.dev` y `onrender.com` (hace falta dominio propio). La web pública hoy muestra el login
y no deja entrar. Es aceptable porque aún no hay usuarios reales. La app completa se prueba en local.

Para dejar producción funcionando, en este orden:
1. Comprar dominio y configurar `app.<dominio>` (Cloudflare Pages) y `api.<dominio>` (Render); actualizar
   `CORS_ORIGIN` (Render) y `VITE_API_URL` (Cloudflare) y volver a desplegar la web.
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
- **Antes de publicar el login hace falta dominio propio** (p. ej. `app.<dominio>` y `api.<dominio>`):
  la cookie de sesión no funciona entre `pages.dev` y `onrender.com` (cookies de terceros bloqueadas en
  Brave/Safari/Chrome). Además Brave Shields bloquea `onrender.com` (`ERR_BLOCKED_BY_CLIENT`).
  La cookie hoy es `SameSite=Lax`; con ambos subdominios bajo el mismo dominio sigue funcionando.

Notas del entorno (Windows):
- La API tarda ~13 s en arrancar. Para probarla desde PowerShell usar `127.0.0.1` en vez de `localhost`
  (`Invoke-RestMethod` a `localhost` puede fallar por IPv6 aunque la API esté bien).
- **No editar archivos con tildes usando `Get-Content`/`Set-Content` de PowerShell 5.1**: lee en ANSI y
  escribe con BOM, y deja el texto como "mÃ¡ximo". Usar siempre la herramienta de edición.
- `npm run crear-admin ... --nombre "Nombre Apellido"` en Windows guarda el nombre con símbolos `^` (cmd.exe
  mastica las comillas). Usar un nombre sin espacios, o ejecutar `node dist/cli/crear-admin.js ...` directo,
  o corregirlo después con SQL. Igual con tildes enviadas por `Invoke-RestMethod`: mandar el cuerpo en UTF-8.
- En desarrollo solo la BD va en Docker; API y web corren directo con `npm run dev:api` / `dev:web`.
