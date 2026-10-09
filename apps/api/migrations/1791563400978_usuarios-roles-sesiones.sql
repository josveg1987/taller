-- Up Migration

-- ============================================================================
-- Fase 2b: roles, limite de usuarios por taller, administrador de la app y sesiones.
--
--   * administradores_app: dueños de la plataforma. No pertenecen a ningun taller; por eso no
--     llevan taller_id ni RLS, y el rol taller_app no tiene ningun permiso sobre la tabla.
--   * usuarios (de taller): todos son administradores de su taller.
--   * sesiones: tampoco es accesible para taller_app. Se guarda el hash del token, no el token.
-- ============================================================================

-- Roles de usuario de taller: por ahora solo administrador de taller.
UPDATE usuarios SET rol = 'admin_taller' WHERE rol <> 'admin_taller';
ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
ALTER TABLE usuarios ALTER COLUMN rol SET DEFAULT 'admin_taller';
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin_taller'));

-- Configuracion del taller que fija el administrador de la app.
ALTER TABLE talleres ADD COLUMN max_usuarios integer NOT NULL DEFAULT 2 CHECK (max_usuarios >= 1);
ALTER TABLE talleres ADD COLUMN activo boolean NOT NULL DEFAULT true;

-- Un taller no puede superar su limite de usuarios activos. Se valida en la base para que
-- ningun camino de codigo lo salte. El FOR UPDATE serializa altas simultaneas del mismo taller.
CREATE FUNCTION validar_limite_usuarios() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  maximo integer;
  actuales integer;
BEGIN
  IF NEW.activo THEN
    SELECT max_usuarios INTO maximo FROM talleres WHERE id = NEW.taller_id FOR UPDATE;
    SELECT count(*) INTO actuales FROM usuarios
      WHERE taller_id = NEW.taller_id AND activo AND id <> NEW.id;
    IF actuales >= maximo THEN
      RAISE EXCEPTION 'El taller alcanzo su limite de % usuarios', maximo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER usuarios_limite
  BEFORE INSERT OR UPDATE OF activo ON usuarios
  FOR EACH ROW EXECUTE FUNCTION validar_limite_usuarios();

-- El hash de la contraseña no se puede leer con el rol de la aplicacion (si escribir: alta y
-- cambio de clave). El inicio de sesion lo hace la conexion administrativa.
REVOKE SELECT ON usuarios FROM taller_app;
GRANT SELECT (id, taller_id, nombre, email, rol, activo, creado_en) ON usuarios TO taller_app;

CREATE TABLE administradores_app (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL,
  email         text NOT NULL,
  password_hash text NOT NULL,
  activo        boolean NOT NULL DEFAULT true,
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX administradores_app_email_unico ON administradores_app (lower(email));

CREATE TABLE sesiones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash       text NOT NULL UNIQUE,
  usuario_id       uuid REFERENCES usuarios (id) ON DELETE CASCADE,
  admin_id         uuid REFERENCES administradores_app (id) ON DELETE CASCADE,
  -- Solo para administradores de la app: el taller en que estan "entrados" ahora.
  taller_activo_id uuid REFERENCES talleres (id) ON DELETE SET NULL,
  creada_en        timestamptz NOT NULL DEFAULT now(),
  expira_en        timestamptz NOT NULL,
  -- Es de un usuario de taller o de un administrador de la app, nunca de ambos.
  CHECK ((usuario_id IS NOT NULL) <> (admin_id IS NOT NULL)),
  CHECK (taller_activo_id IS NULL OR admin_id IS NOT NULL)
);
CREATE INDEX sesiones_expira ON sesiones (expira_en);

-- Down Migration

DROP TABLE sesiones;
DROP TABLE administradores_app;
DROP TRIGGER usuarios_limite ON usuarios;
DROP FUNCTION validar_limite_usuarios();
REVOKE SELECT (id, taller_id, nombre, email, rol, activo, creado_en) ON usuarios FROM taller_app;
GRANT SELECT ON usuarios TO taller_app;
ALTER TABLE talleres DROP COLUMN activo;
ALTER TABLE talleres DROP COLUMN max_usuarios;
ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
ALTER TABLE usuarios ALTER COLUMN rol SET DEFAULT 'dueno';
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('dueno', 'operador'));
UPDATE usuarios SET rol = 'dueno';
