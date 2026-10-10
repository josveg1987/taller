-- Up Migration

-- Contrasena temporal: cuando un administrador crea una cuenta o le pone una clave a alguien, esa
-- cuenta debe cambiarla al entrar. Se apaga cuando la persona cambia su propia contrasena.
ALTER TABLE usuarios ADD COLUMN debe_cambiar_password boolean NOT NULL DEFAULT false;
ALTER TABLE administradores_app ADD COLUMN debe_cambiar_password boolean NOT NULL DEFAULT false;

-- Logo del taller en SVG (version para fondo claro: es la que va en el PDF). Solo lo edita el
-- administrador de la APP: taller_app no tiene UPDATE sobre esta columna (los permisos de
-- talleres son por columna, ver permisos-columnas-talleres).
ALTER TABLE talleres ADD COLUMN logo_claro_svg text
  CHECK (logo_claro_svg IS NULL OR length(logo_claro_svg) <= 100000);

-- Down Migration

ALTER TABLE talleres DROP COLUMN logo_claro_svg;
ALTER TABLE administradores_app DROP COLUMN debe_cambiar_password;
ALTER TABLE usuarios DROP COLUMN debe_cambiar_password;
