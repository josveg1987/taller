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

## Comandos
```bash
npm install              # instala todo el monorepo
npm run dev:api          # API en http://localhost:3000 (GET /health)
npm run dev:web          # PWA en http://localhost:5173
npm test                 # tests de packages/shared
npm run build            # compila shared, api y web (en ese orden)
npm run db:up            # PostgreSQL local con Docker (requiere Docker Desktop)
```
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
- Siguiente: Fase 2 (modelo de datos + login + datos del taller). Para las migraciones usar la conexión
  directa de Neon (sin `-pooler`); con el pooler (pgbouncer en modo transacción) el RLS debe usar
  `SET LOCAL` / `set_config(..., true)` dentro de una transacción.
- Respaldo diario con GitHub Actions (puede esperar a la Fase 2).
- Antes del piloto: dominio propio para la API (p. ej. `api.<dominio>`). Brave Shields bloquea
  `onrender.com` (`ERR_BLOCKED_BY_CLIENT`) y la web dice "Sin conexión" en ese navegador.

Notas del entorno (Windows):
- La API tarda ~13 s en arrancar. Para probarla desde PowerShell usar `127.0.0.1` en vez de `localhost`
  (`Invoke-RestMethod` a `localhost` puede fallar por IPv6 aunque la API esté bien).
- En desarrollo solo la BD va en Docker; API y web corren directo con `npm run dev:api` / `dev:web`.
