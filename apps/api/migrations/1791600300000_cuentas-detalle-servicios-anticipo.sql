-- Up Migration

-- ============================================================================
-- 1. Cuentas para transferir (varias por taller; salen en el PDF las activas)
-- ============================================================================
CREATE TABLE cuentas_bancarias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   uuid NOT NULL REFERENCES talleres (id) ON DELETE CASCADE,
  titular     text NOT NULL,
  -- Se guarda normalizado: 12345678-5 (el PDF lo muestra con puntos).
  rut         text NOT NULL,
  banco       text NOT NULL,
  tipo_cuenta text NOT NULL CHECK (tipo_cuenta IN ('corriente', 'vista', 'ahorro')),
  numero      text NOT NULL,
  email       text,
  activa      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, taller_id)
);
CREATE INDEX cuentas_bancarias_taller ON cuentas_bancarias (taller_id, orden);

ALTER TABLE cuentas_bancarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON cuentas_bancarias USING (taller_id = taller_actual()) WITH CHECK (taller_id = taller_actual());
GRANT SELECT, INSERT, UPDATE, DELETE ON cuentas_bancarias TO taller_app;

-- ============================================================================
-- 2. Detalle del trabajo (texto de "Que incluye el trabajo" del PDF). NULL = texto estandar.
-- ============================================================================
ALTER TABLE talleres
  ADD COLUMN detalle_pintura text,
  ADD COLUMN detalle_desabollado text;
-- Los permisos de talleres son por columna (ver permisos-columnas-talleres): se agregan las nuevas.
GRANT UPDATE (detalle_pintura, detalle_desabollado) ON talleres TO taller_app;

-- ============================================================================
-- 3. Servicios (pulido y otros): plantilla global de solo lectura + servicios de cada taller.
--    Igual que las piezas: al crear un taller se copia la plantilla (sin precios).
-- ============================================================================
CREATE TABLE catalogo_servicios_base (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre      text NOT NULL UNIQUE,
  descripcion text,
  orden       integer NOT NULL
);

INSERT INTO catalogo_servicios_base (nombre, descripcion, orden) VALUES
  ('Pulido general del auto', 'Pulido y abrillantado de toda la carrocería para recuperar el brillo de la pintura y eliminar rayas superficiales.', 1),
  ('Pulido de focos', 'Pulido de los focos para eliminar la opacidad y recuperar su transparencia.', 2);

GRANT SELECT ON catalogo_servicios_base TO taller_app;

CREATE TABLE servicios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id       uuid NOT NULL REFERENCES talleres (id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  -- Precio con que parte al agregarlo a un presupuesto (editable ahi); NULL = sin precio sugerido.
  precio_sugerido integer CHECK (precio_sugerido >= 0),
  -- Texto que sale bajo el nombre en el PDF.
  descripcion     text,
  activo          boolean NOT NULL DEFAULT true,
  orden           integer NOT NULL DEFAULT 0,
  UNIQUE (id, taller_id),
  UNIQUE (taller_id, nombre)
);

ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON servicios USING (taller_id = taller_actual()) WITH CHECK (taller_id = taller_actual());
GRANT SELECT, INSERT, UPDATE, DELETE ON servicios TO taller_app;

-- Los talleres que ya existen reciben la plantilla (los nuevos la reciben al crearse).
INSERT INTO servicios (taller_id, nombre, descripcion, orden)
  SELECT t.id, b.nombre, b.descripcion, b.orden FROM talleres t CROSS JOIN catalogo_servicios_base b
ON CONFLICT (taller_id, nombre) DO NOTHING;

-- ============================================================================
-- 4. Anticipo por presupuesto y 5. descripcion de una linea (servicios): "foto" guardada en el presupuesto.
-- ============================================================================
-- true = se solicita el anticipo que indique la configuracion del taller (lo que ya hacian los presupuestos existentes).
ALTER TABLE presupuestos ADD COLUMN solicita_anticipo boolean NOT NULL DEFAULT true;
ALTER TABLE presupuesto_lineas ADD COLUMN descripcion text;

-- Down Migration

ALTER TABLE presupuesto_lineas DROP COLUMN descripcion;
ALTER TABLE presupuestos DROP COLUMN solicita_anticipo;
DROP TABLE servicios;
DROP TABLE catalogo_servicios_base;
REVOKE UPDATE (detalle_pintura, detalle_desabollado) ON talleres FROM taller_app;
ALTER TABLE talleres DROP COLUMN detalle_desabollado, DROP COLUMN detalle_pintura;
DROP TABLE cuentas_bancarias;
