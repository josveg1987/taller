-- Up Migration

-- ============================================================================
-- Catalogo de vehiculos (marca > modelo > años) para sugerir al escribir.
--
-- Son tablas de REFERENCIA GLOBALES: iguales para todos los talleres, sin taller_id ni RLS.
-- La app (taller_app) solo puede leerlas; las carga una migracion (ver datos/catalogo.cjs).
-- Los vehiculos de un taller guardan marca, modelo y año como TEXTO (no apuntan a estas
-- tablas): un auto que no este en el catalogo igual se puede registrar a mano, y cambiar el
-- catalogo no altera los vehiculos ni los presupuestos ya guardados.
-- ============================================================================

CREATE TABLE catalogo_marcas (
  id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

CREATE TABLE catalogo_modelos (
  id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  marca_id integer NOT NULL REFERENCES catalogo_marcas (id) ON DELETE CASCADE,
  nombre   text NOT NULL,
  UNIQUE (marca_id, nombre)
);

-- Años en que existe cada modelo.
CREATE TABLE catalogo_modelo_anios (
  modelo_id integer NOT NULL REFERENCES catalogo_modelos (id) ON DELETE CASCADE,
  anio      smallint NOT NULL CHECK (anio BETWEEN 1900 AND 2100),
  PRIMARY KEY (modelo_id, anio)
);

-- Que fuentes se han cargado (para saber con que version de la lista se trabaja).
CREATE TABLE catalogo_cargas (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fuente        text NOT NULL,
  marcas        integer NOT NULL,
  modelos       integer NOT NULL,
  combinaciones integer NOT NULL,
  cargada_en    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON catalogo_marcas, catalogo_modelos, catalogo_modelo_anios, catalogo_cargas TO taller_app;

-- Down Migration

DROP TABLE catalogo_cargas;
DROP TABLE catalogo_modelo_anios;
DROP TABLE catalogo_modelos;
DROP TABLE catalogo_marcas;
