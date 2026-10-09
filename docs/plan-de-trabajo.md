# Plan de trabajo

Cada fase termina desplegada y probada. Una funcionalidad por sesión de trabajo, con tests donde
haya reglas de negocio, y commit al terminar cada paso.

| Fase | Contenido | Historias |
|---|---|---|
| 1. Esqueleto | Monorepo, API con `/health`, PWA, cálculo compartido con tests. **Hecha.** | — |
| 1b. Publicar | Subir a GitHub; BD en Neon; API en Render (Docker); PWA en Cloudflare Pages. Validar desde el celular. | — |
| 2. Base | Modelo de datos completo + migraciones, login, datos del taller | HU-20, 37, 29, 31, 34 |
| 3. Clientes | Clientes, vehículos y búsqueda por patente | HU-01 a 03 |
| 4. Catálogo | Piezas, posiciones, combos y montos rápidos | HU-16, 33, 38 |
| 5. Presupuesto | Flujo de 3 pantallas + cálculo con tests + borradores locales | HU-05 a 10, 13, 28, 30, 32, 35, 43 |
| 6. PDF | Generación y compartir por WhatsApp | HU-21, 22 |
| 7. Seguimiento | Estados, listado e historiales | HU-23, 24, 39, 40 |
| 8. Reportes | Resumen del mes y pendientes | HU-41, 42 |
| 9. Piloto | El taller lo usa en paralelo con el Excel y se ajusta | — |

## Pendiente de la Fase 1b (hacerlo a mano)
- Crear repositorio en GitHub y subir el código.
- Crear cuentas gratis: Neon, Render, Cloudflare.
- Configurar `DATABASE_URL`, `CORS_ORIGIN` (URL de la PWA) y, en la web, `VITE_API_URL` (URL de la API).
- Respaldo diario con GitHub Actions (puede esperar a la Fase 2).
