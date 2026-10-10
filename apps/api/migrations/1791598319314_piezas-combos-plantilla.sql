-- Up Migration

-- ============================================================================
-- Fase 4: catalogo de piezas y combos.
--
--   * catalogo_piezas_base / catalogo_combos_base: PLANTILLA global y de solo lectura. Cuando se
--     crea un taller se copia a sus propias tablas (piezas, combos), que cada taller edita.
--   * combos y combo_piezas: combos del taller (HU-38), con taller_id y RLS. Reemplazan a la
--     columna suelta talleres.combos (jsonb), que no tenia integridad referencial.
--   * Un combo guarda solo las piezas: el lado (izquierda/derecha) se elige al aplicarlo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Plantilla estandar (global, solo lectura)
-- ---------------------------------------------------------------------------
CREATE TABLE catalogo_piezas_base (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre       text NOT NULL UNIQUE,
  -- true: se cotiza por lado (izquierda/derecha); false: es una sola pieza.
  usa_posicion boolean NOT NULL,
  orden        integer NOT NULL
);

INSERT INTO catalogo_piezas_base (nombre, usa_posicion, orden) VALUES
  ('Parachoques delantero', false, 1),
  ('Parachoques trasero',   false, 2),
  ('Capot',                 false, 3),
  ('Tapabarro delantero',   true,  4),
  ('Puerta delantera',      true,  5),
  ('Puerta trasera',        true,  6),
  ('Costado trasero',       true,  7),
  ('Zócalo',                true,  8),
  ('Espejo',                true,  9),
  ('Techo',                 false, 10),
  ('Maleta / portalón',     false, 11),
  ('Alerón',                false, 12),
  ('Tolva',                 false, 13);

CREATE TABLE catalogo_combos_base (
  id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  orden  integer NOT NULL
);

CREATE TABLE catalogo_combo_base_piezas (
  combo_id integer NOT NULL REFERENCES catalogo_combos_base (id) ON DELETE CASCADE,
  pieza_id integer NOT NULL REFERENCES catalogo_piezas_base (id) ON DELETE CASCADE,
  orden    integer NOT NULL,
  PRIMARY KEY (combo_id, pieza_id)
);

-- Ejemplo de combo (el requerimiento menciona "lateral completo"); cada taller lo puede editar o desactivar.
INSERT INTO catalogo_combos_base (nombre, orden) VALUES ('Lateral completo', 1);
INSERT INTO catalogo_combo_base_piezas (combo_id, pieza_id, orden)
  SELECT c.id, p.id, p.orden
    FROM catalogo_combos_base c
    JOIN catalogo_piezas_base p ON p.nombre IN ('Tapabarro delantero', 'Puerta delantera', 'Puerta trasera', 'Costado trasero', 'Zócalo')
   WHERE c.nombre = 'Lateral completo';

GRANT SELECT ON catalogo_piezas_base, catalogo_combos_base, catalogo_combo_base_piezas TO taller_app;

-- ---------------------------------------------------------------------------
-- Combos de cada taller
-- ---------------------------------------------------------------------------
CREATE TABLE combos (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id uuid NOT NULL REFERENCES talleres (id) ON DELETE CASCADE,
  nombre    text NOT NULL,
  orden     integer NOT NULL DEFAULT 0,
  activo    boolean NOT NULL DEFAULT true,
  UNIQUE (id, taller_id),
  UNIQUE (taller_id, nombre)
);

CREATE TABLE combo_piezas (
  combo_id  uuid NOT NULL,
  taller_id uuid NOT NULL REFERENCES talleres (id) ON DELETE CASCADE,
  pieza_id  uuid NOT NULL,
  orden     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (combo_id, pieza_id),
  FOREIGN KEY (combo_id, taller_id) REFERENCES combos (id, taller_id) ON DELETE CASCADE,
  FOREIGN KEY (pieza_id, taller_id) REFERENCES piezas (id, taller_id) ON DELETE CASCADE
);
CREATE INDEX combo_piezas_pieza ON combo_piezas (taller_id, pieza_id);

ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON combos USING (taller_id = taller_actual()) WITH CHECK (taller_id = taller_actual());
ALTER TABLE combo_piezas ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON combo_piezas USING (taller_id = taller_actual()) WITH CHECK (taller_id = taller_actual());

GRANT SELECT, INSERT, UPDATE, DELETE ON combos, combo_piezas TO taller_app;

-- La columna suelta talleres.combos queda reemplazada por las tablas de arriba.
ALTER TABLE talleres DROP COLUMN combos;

-- Montos rapidos de desabollado (HU-33): el requerimiento da como ejemplo 30, 60 y 100 mil. Editables por taller.
ALTER TABLE talleres ALTER COLUMN montos_desabollado SET DEFAULT '{30000,60000,100000}';
UPDATE talleres SET montos_desabollado = '{30000,60000,100000}' WHERE montos_desabollado = '{}';

-- Down Migration

ALTER TABLE talleres ALTER COLUMN montos_desabollado SET DEFAULT '{}';
ALTER TABLE talleres ADD COLUMN combos jsonb NOT NULL DEFAULT '[]';
GRANT UPDATE (combos) ON talleres TO taller_app;
DROP TABLE combo_piezas;
DROP TABLE combos;
DROP TABLE catalogo_combo_base_piezas;
DROP TABLE catalogo_combos_base;
DROP TABLE catalogo_piezas_base;
