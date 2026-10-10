-- Up Migration

-- unaccent es una extension estandar de PostgreSQL (contrib), tambien disponible en Neon y AWS.
-- Permite que buscar "jose" encuentre "José" al buscar clientes por nombre.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Down Migration

-- No se elimina la extension: otras migraciones o consultas pueden depender de ella.
