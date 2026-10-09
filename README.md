# Taller App

Presupuestos para talleres de pintura y desabolladura. Monorepo con API (NestJS), PWA (React) y
reglas de cálculo compartidas. Documentación en [`docs/`](docs) y reglas del proyecto en
[`CLAUDE.md`](CLAUDE.md).

## Requisitos
- Node.js 24 (LTS) y npm
- Docker Desktop (opcional, para PostgreSQL local; si no, usar una base de Neon)

## Primeros pasos
```bash
npm install
cp .env.example .env        # en Windows PowerShell: Copy-Item .env.example .env
npm run dev:api             # http://localhost:3000/health
npm run dev:web             # http://localhost:5173  (en otra terminal)
npm test
```
La PWA debe mostrar "Conectado". Sin base de datos configurada muestra "Base de datos: no configurada".

## Estructura
```
apps/api          API NestJS
apps/web          PWA React + Vite
packages/shared   Tipos y reglas de cálculo del presupuesto (con tests)
docs/             Requerimientos, modelo de datos, arquitectura y plan de trabajo
```
