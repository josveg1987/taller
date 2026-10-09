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

Pendiente al retomar:
- **Cambiar la contraseña de la BD en Neon** (quedó visible en una captura del chat): Neon > Connect >
  Reset password, y actualizar `DATABASE_URL` en Render.
- Fase 2 en curso. **2a hecha en local** (2026-10-09): migración `1791562700525_modelo-inicial.sql`
  (8 tablas + RLS + rol `taller_app` + numeración por taller), `conTaller()` y 13 tests de aislamiento.
  **Se trabaja en local; no se hace push ni se migra Neon hasta que el dueño del proyecto lo decida**
  (acordado 2026-10-09). Al publicar: push a `main` (redespliega Render y Cloudflare) y aplicar las
  migraciones en Neon con la conexión directa, sin `-pooler`.
  **2b-1 hecha en local** (API de autenticación): migración `1791563400978_usuarios-roles-sesiones.sql`,
  módulo `apps/api/src/auth/` (scrypt, sesiones en BD, guard global, `/auth/login|logout|me`),
  comando `crear-admin` y 38 tests (`npm run test:db`). Sin commit aún al escribir esto.
  Pendiente de la Fase 2, en este orden:
  - 2b-2 hecha en local: pantalla de login en la web (`apps/web/src/`: `api.ts`, `sesion.tsx`, `Login.tsx`,
    `Inicio.tsx`). Al abrir llama a `/health` y `/auth/me`; cerrar sesión borra datos locales
    (`datosLocales.ts`). Cuenta de prueba solo en la BD local: `admin@taller.local` (contraseña que mostró
    `crear-admin`; para otra, crear una nueva con ese comando).
  - 2e (después del dominio): passkeys (huella / Face ID). Ver `docs/plan-de-trabajo.md`.
  - 2c: mantenedores del administrador de la APP (talleres con `max_usuarios` y `activo`, usuarios,
    "entrar" a un taller para ver sus datos: `sesiones.taller_activo_id`).
  - 2d: administrador de taller: datos del taller (HU-20, 37, 29, 31, 34) y sus usuarios.
- Respaldo diario con GitHub Actions (puede esperar a la Fase 2).
- **Antes de publicar el login hace falta dominio propio** (p. ej. `app.<dominio>` y `api.<dominio>`):
  la cookie de sesión no funciona entre `pages.dev` y `onrender.com` (cookies de terceros bloqueadas en
  Brave/Safari/Chrome). Además Brave Shields bloquea `onrender.com` (`ERR_BLOCKED_BY_CLIENT`).
  La cookie hoy es `SameSite=Lax`; con ambos subdominios bajo el mismo dominio sigue funcionando.

Notas del entorno (Windows):
- La API tarda ~13 s en arrancar. Para probarla desde PowerShell usar `127.0.0.1` en vez de `localhost`
  (`Invoke-RestMethod` a `localhost` puede fallar por IPv6 aunque la API esté bien).
- En desarrollo solo la BD va en Docker; API y web corren directo con `npm run dev:api` / `dev:web`.
