# Plan de trabajo

Cada fase termina desplegada y probada. Una funcionalidad por sesión de trabajo, con tests donde
haya reglas de negocio, y commit al terminar cada paso.

| Fase | Contenido | Historias |
|---|---|---|
| 1. Esqueleto | Monorepo, API con `/health`, PWA, cálculo compartido con tests. **Hecha.** | — |
| 1b. Publicar | Subir a GitHub; BD en Neon; API en Render (Docker); PWA en Cloudflare Pages. Validar desde el celular. **Hecha.** | — |
| 2a. Base de datos | Modelo de datos + migraciones SQL + aislamiento por taller (RLS). **Hecha (local).** | — |
| 2b. Login | API de autenticación y pantalla de login en la web. **Hecha (local).** | — |
| 2c. Admin de la APP | Mantenedores de talleres (límite de usuarios, suspender) y usuarios; entrar a un taller. **Hecha (local).** | — |
| 2d. Admin de taller | Datos del taller, configuración y sus usuarios (sin logo, que necesita R2). **Hecha (local).** | HU-20, 37, 29, 31, 34 |
| 2e. Passkeys | Entrar con huella / Face ID (WebAuthn) además de la contraseña. **Después de tener el dominio propio** (la passkey queda atada al dominio). Evaluar `@simplewebauthn`. | — |
| 3. Clientes | Clientes, vehículos y búsqueda por patente, nombre o teléfono. **Hecha (local).** | HU-01 a 03 |
| 3b. Catálogo de vehículos | Marca, modelo y año con sugerencias al escribir, desde el listado del SII; carga automática con las migraciones. **Hecha (local).** | HU-02 |
| 4. Catálogo | Piezas, posiciones, combos y montos rápidos. **Hecha (local).** | HU-16, 33, 38 |
| 5. Presupuesto | Flujo de 3 pantallas + cálculo con tests + borradores locales | HU-05 a 10, 13, 28, 30, 32, 35, 43 |
| 6. PDF | Generación y compartir por WhatsApp | HU-21, 22 |
| 7. Seguimiento | Estados, listado e historiales | HU-23, 24, 39, 40 |
| 8. Reportes | Resumen del mes y pendientes | HU-41, 42 |
| 9. Piloto | El taller lo usa en paralelo con el Excel y se ajusta | — |

## Fase 1b: hecha (2026-10-09)
Repositorio en GitHub, BD en Neon, API en Render (Docker) y PWA en Cloudflare Pages, con
`DATABASE_URL`, `CORS_ORIGIN` y `VITE_API_URL` configurados. Detalle de URLs en `CLAUDE.md`.

## Pendiente
- Cambiar la contraseña de la BD en Neon y actualizar `DATABASE_URL` en Render.
- Respaldo diario con GitHub Actions (puede esperar a la Fase 2).
- Dominio propio (`app.` + `api.`) **antes de publicar el login**: la cookie de sesión no funciona entre
  `pages.dev` y `onrender.com`, y Brave Shields bloquea `onrender.com`. También lo necesitan las passkeys.
- Entrar con Google: descartado por ahora (más fricción que las passkeys); reevaluar si un taller lo pide.
