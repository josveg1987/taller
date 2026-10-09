-- Up Migration

-- ============================================================================
-- Modelo inicial (Fase 2a). Ver docs/modelo-datos.md.
--
-- Aislamiento entre talleres:
--   * Toda tabla de negocio lleva taller_id y Row Level Security.
--   * La API opera con el rol `taller_app` (SET LOCAL ROLE dentro de una transaccion) y fija el
--     taller con set_config('app.taller_id', ..., true). Sin taller fijado no se ve ninguna fila.
--   * El dueno de las tablas (el rol con que se migra) NO queda sujeto al RLS: solo se usa para
--     migraciones y para tareas administrativas (alta de taller, buscar usuario al iniciar sesion).
--   * Las llaves foraneas incluyen taller_id, asi un registro no puede apuntar a otro taller.
-- ============================================================================

-- Rol de la aplicacion. Sin login: se asume con SET ROLE desde la conexion del dueno.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'taller_app') THEN
    CREATE ROLE taller_app NOLOGIN;
  END IF;
  EXECUTE format('GRANT taller_app TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO taller_app;

-- Taller activo de la transaccion actual (NULL si no se fijo).
CREATE FUNCTION taller_actual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.taller_id', true), '')::uuid $$;

-- ---------------------------------------------------------------------------
-- talleres: datos y configuracion de cada taller (HU-20, 29, 31, 34, 37, 33, 38)
-- ---------------------------------------------------------------------------
CREATE TABLE talleres (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre               text NOT NULL,
  logo_key             text,
  direccion            text,
  telefono             text,
  datos_transferencia  text,
  tarifa_pintura       integer NOT NULL DEFAULT 0 CHECK (tarifa_pintura >= 0),
  margen_repuestos_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (margen_repuestos_pct >= 0),
  anticipo_tipo        text NOT NULL DEFAULT 'repuestos'
                         CHECK (anticipo_tipo IN ('ninguno', 'repuestos', 'porcentaje', 'fijo')),
  anticipo_valor       integer CHECK (anticipo_valor >= 0),
  validez_dias         integer NOT NULL DEFAULT 15 CHECK (validez_dias > 0),
  condiciones          text NOT NULL DEFAULT '',
  siguiente_numero     integer NOT NULL DEFAULT 1 CHECK (siguiente_numero >= 1),
  montos_desabollado   integer[] NOT NULL DEFAULT '{}',
  combos               jsonb NOT NULL DEFAULT '[]',
  creado_en            timestamptz NOT NULL DEFAULT now(),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  -- porcentaje y fijo necesitan un valor; ninguno y repuestos no.
  CONSTRAINT talleres_anticipo_valor CHECK (
    (anticipo_tipo IN ('porcentaje', 'fijo')) = (anticipo_valor IS NOT NULL)
  )
);

-- ---------------------------------------------------------------------------
-- usuarios: maximo 2 por taller (regla de la aplicacion). Email unico en todo el sistema
-- porque se usa para iniciar sesion antes de saber a que taller pertenece.
-- ---------------------------------------------------------------------------
CREATE TABLE usuarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id     uuid NOT NULL REFERENCES talleres (id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  email         text NOT NULL,
  password_hash text NOT NULL,
  rol           text NOT NULL DEFAULT 'dueno' CHECK (rol IN ('dueno', 'operador')),
  activo        boolean NOT NULL DEFAULT true,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, taller_id)
);
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));
CREATE INDEX usuarios_taller ON usuarios (taller_id);

-- ---------------------------------------------------------------------------
-- clientes y vehiculos (HU-01 a 03)
-- ---------------------------------------------------------------------------
CREATE TABLE clientes (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id uuid NOT NULL REFERENCES talleres (id) ON DELETE CASCADE,
  nombre    text NOT NULL,
  telefono  text NOT NULL,
  rut       text,
  email     text,
  direccion text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, taller_id)
);
CREATE INDEX clientes_taller_telefono ON clientes (taller_id, telefono);
CREATE INDEX clientes_taller_nombre ON clientes (taller_id, lower(nombre));

CREATE TABLE vehiculos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id  uuid NOT NULL REFERENCES talleres (id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL,
  -- Patente normalizada: mayusculas, sin espacios ni guiones (ej. "ABCD12").
  patente    text NOT NULL CHECK (patente = upper(patente) AND patente ~ '^[A-Z0-9]+$'),
  marca      text,
  modelo     text,
  anio       smallint CHECK (anio BETWEEN 1900 AND 2100),
  color      text,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, taller_id),
  UNIQUE (taller_id, patente),
  FOREIGN KEY (cliente_id, taller_id) REFERENCES clientes (id, taller_id)
);
CREATE INDEX vehiculos_cliente ON vehiculos (taller_id, cliente_id);

-- ---------------------------------------------------------------------------
-- piezas: catalogo del taller (HU-16)
-- ---------------------------------------------------------------------------
CREATE TABLE piezas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL REFERENCES talleres (id) ON DELETE CASCADE,
  nombre         text NOT NULL,
  usa_posicion   boolean NOT NULL DEFAULT true,
  -- NULL = usa la tarifa de pintura del taller.
  tarifa_pintura integer CHECK (tarifa_pintura >= 0),
  activa         boolean NOT NULL DEFAULT true,
  orden          integer NOT NULL DEFAULT 0,
  UNIQUE (id, taller_id),
  UNIQUE (taller_id, nombre)
);

-- ---------------------------------------------------------------------------
-- presupuestos, lineas e historial (HU-05 a 10, 13, 23, 28, 30, 32, 35)
-- Los montos se calculan en el servidor con @taller/shared y se guardan como foto.
-- ---------------------------------------------------------------------------
CREATE TABLE presupuestos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id       uuid NOT NULL REFERENCES talleres (id) ON DELETE CASCADE,
  numero          integer NOT NULL CHECK (numero >= 1),
  cliente_id      uuid NOT NULL,
  vehiculo_id     uuid NOT NULL,
  fecha           date NOT NULL DEFAULT current_date,
  valido_hasta    date NOT NULL,
  estado          text NOT NULL DEFAULT 'borrador'
                    CHECK (estado IN ('borrador', 'enviado', 'aceptado', 'rechazado', 'vencido')),
  descuento       integer NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  total           integer NOT NULL DEFAULT 0 CHECK (total >= 0),
  monto_inicio    integer NOT NULL DEFAULT 0 CHECK (monto_inicio >= 0),
  costo_repuestos integer NOT NULL DEFAULT 0 CHECK (costo_repuestos >= 0),
  observaciones   text,
  -- Condiciones de este presupuesto (parten de las del taller y son editables).
  condiciones     text NOT NULL DEFAULT '',
  creado_por      uuid,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, taller_id),
  UNIQUE (taller_id, numero),
  CHECK (valido_hasta >= fecha),
  FOREIGN KEY (cliente_id, taller_id) REFERENCES clientes (id, taller_id),
  FOREIGN KEY (vehiculo_id, taller_id) REFERENCES vehiculos (id, taller_id),
  FOREIGN KEY (creado_por, taller_id) REFERENCES usuarios (id, taller_id)
);
CREATE INDEX presupuestos_estado_fecha ON presupuestos (taller_id, estado, fecha DESC);
CREATE INDEX presupuestos_cliente ON presupuestos (taller_id, cliente_id);
CREATE INDEX presupuestos_vehiculo ON presupuestos (taller_id, vehiculo_id);

CREATE TABLE presupuesto_lineas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL REFERENCES talleres (id) ON DELETE CASCADE,
  presupuesto_id uuid NOT NULL,
  pieza_id       uuid,
  -- Foto: el nombre y los montos quedan como se cotizaron.
  nombre_pieza   text NOT NULL,
  posicion       text NOT NULL DEFAULT 'no_aplica'
                   CHECK (posicion IN ('izquierda', 'derecha', 'no_aplica')),
  operacion      text NOT NULL CHECK (operacion IN ('reparar', 'reemplazar', 'libre')),
  pintura        integer NOT NULL DEFAULT 0 CHECK (pintura >= 0),
  desabollado    integer NOT NULL DEFAULT 0 CHECK (desabollado >= 0),
  repuesto_costo integer NOT NULL DEFAULT 0 CHECK (repuesto_costo >= 0),
  margen_pct     numeric(5,2) NOT NULL DEFAULT 0 CHECK (margen_pct >= 0),
  precio_total   integer NOT NULL DEFAULT 0 CHECK (precio_total >= 0),
  orden          integer NOT NULL DEFAULT 0,
  FOREIGN KEY (presupuesto_id, taller_id) REFERENCES presupuestos (id, taller_id) ON DELETE CASCADE,
  FOREIGN KEY (pieza_id, taller_id) REFERENCES piezas (id, taller_id) ON DELETE SET NULL (pieza_id)
);
CREATE INDEX presupuesto_lineas_presupuesto ON presupuesto_lineas (taller_id, presupuesto_id, orden);

CREATE TABLE historial_estados (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL REFERENCES talleres (id) ON DELETE CASCADE,
  presupuesto_id uuid NOT NULL,
  estado         text NOT NULL
                   CHECK (estado IN ('borrador', 'enviado', 'aceptado', 'rechazado', 'vencido')),
  fecha          timestamptz NOT NULL DEFAULT now(),
  usuario_id     uuid,
  FOREIGN KEY (presupuesto_id, taller_id) REFERENCES presupuestos (id, taller_id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id, taller_id) REFERENCES usuarios (id, taller_id)
);
CREATE INDEX historial_presupuesto ON historial_estados (taller_id, presupuesto_id, fecha);

-- ---------------------------------------------------------------------------
-- Numeracion correlativa por taller (HU-28). Debe llamarse dentro de la misma transaccion
-- que inserta el presupuesto: si esta falla, el numero no se consume.
-- ---------------------------------------------------------------------------
CREATE FUNCTION siguiente_numero_presupuesto() RETURNS integer
  LANGUAGE sql
  AS $$
    UPDATE talleres SET siguiente_numero = siguiente_numero + 1
    WHERE id = taller_actual()
    RETURNING siguiente_numero - 1
  $$;

-- ---------------------------------------------------------------------------
-- Row Level Security: cada taller solo ve y escribe sus filas.
-- ---------------------------------------------------------------------------
ALTER TABLE talleres ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON talleres
  USING (id = taller_actual()) WITH CHECK (id = taller_actual());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'usuarios', 'clientes', 'vehiculos', 'piezas',
    'presupuestos', 'presupuesto_lineas', 'historial_estados'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY aislamiento ON %I USING (taller_id = taller_actual()) WITH CHECK (taller_id = taller_actual())',
      t
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Permisos del rol de la aplicacion. Se dan tabla por tabla a proposito: una tabla nueva
-- no queda expuesta hasta que se le habilite RLS y se le otorgue acceso.
-- ---------------------------------------------------------------------------
-- El alta de talleres la hace el dueno (administrativo); la app solo lee y edita el suyo.
GRANT SELECT, UPDATE ON talleres TO taller_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  usuarios, clientes, vehiculos, piezas, presupuestos, presupuesto_lineas
  TO taller_app;
-- El historial solo se agrega: no se modifica ni se borra.
GRANT SELECT, INSERT ON historial_estados TO taller_app;

-- Down Migration

DROP FUNCTION siguiente_numero_presupuesto();
DROP TABLE historial_estados;
DROP TABLE presupuesto_lineas;
DROP TABLE presupuestos;
DROP TABLE piezas;
DROP TABLE vehiculos;
DROP TABLE clientes;
DROP TABLE usuarios;
DROP TABLE talleres;
DROP FUNCTION taller_actual();
DROP OWNED BY taller_app;
DROP ROLE taller_app;
