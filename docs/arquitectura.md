# Arquitectura

```
Dueño (celular/PC) ──> PWA React (Cloudflare Pages) ──HTTPS/JSON──> API NestJS (Render, Docker)
                                                                       ├─> PostgreSQL (Neon)
                                                                       └─> Archivos (Cloudflare R2)
PWA ──menú Compartir del teléfono──> WhatsApp ──> Cliente final (recibe solo el PDF)
GitHub Actions: respaldo diario (pg_dump) a R2
```

## Módulos de la API
Auth y usuarios · Taller y configuración · Clientes y vehículos · Catálogo y tarifas ·
Presupuestos (reglas de cálculo, numeración, estados) · Generador PDF.

## Flujo de un presupuesto
1. Buscar patente → PWA consulta la API (filtrado por `taller_id`) o usa datos locales.
2. Elegir piezas y montos → total en vivo con `@taller/shared`, borrador en IndexedDB.
3. Guardar → la API recalcula con las reglas oficiales, asigna el número y guarda.
4. Compartir → la API genera el PDF → la PWA abre el menú del teléfono → WhatsApp.

## Hosting del piloto (gratis) y sus límites
- **Render (plan gratis)**: 512 MB RAM, 0,1 CPU; se apaga a los 15 min sin tráfico y tarda
  30–60 s en despertar; disco no persistente; 5 GB de tráfico al mes. Mitigación: ping a `/health`
  al abrir la app, ping externo en horario laboral, y trabajo local-first en la PWA.
- **Neon (gratis)**: PostgreSQL 0,5 GB por proyecto; la base se suspende sola y despierta rápido.
- **Cloudflare Pages / R2**: web estática y archivos. Las fotos (fase 2) se suben directo a R2 con
  URL firmadas para no pasar por la API.
- **Respaldos**: `pg_dump` diario a R2 desde GitHub Actions. No depender de los respaldos del plan gratis.
- Al llegar el primer taller que pague: plan pagado de Render (no se duerme) o migrar a AWS Lightsail
  (precio fijo mensual). La migración es `pg_dump`/`pg_restore` + desplegar la misma imagen Docker +
  cambiar variables de entorno.

## Seguridad y datos personales
- Sin usuarios externos: solo los usuarios de cada taller autentican.
- Sesión en cookie `httpOnly`. Aislamiento entre talleres con `taller_id` + RLS.
- Se guardan datos de clientes de otros talleres: considerar la Ley 21.719 de protección de datos
  personales (Chile) antes de abrir el servicio a terceros.
