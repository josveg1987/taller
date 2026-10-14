-- Up Migration

-- Logo del taller para fondo OSCURO: el encabezado del PDF es una banda azul. Lo sube solo el administrador de la APP
-- (igual que logo_claro_svg: taller_app no tiene permiso de UPDATE sobre esta columna; los permisos de talleres son por columna).
ALTER TABLE talleres ADD COLUMN logo_oscuro_svg text;

-- Down Migration

ALTER TABLE talleres DROP COLUMN logo_oscuro_svg;
