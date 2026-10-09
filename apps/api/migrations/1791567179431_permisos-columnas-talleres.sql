-- Up Migration

-- La app (rol taller_app) solo puede editar los datos y la configuracion del propio taller.
-- Quedan reservados al administrador de la plataforma (conexion administrativa): el limite de
-- usuarios (max_usuarios), el estado (activo), el id y la fecha de creacion.
REVOKE UPDATE ON talleres FROM taller_app;
GRANT UPDATE (
  nombre, logo_key, direccion, telefono, datos_transferencia, tarifa_pintura, margen_repuestos_pct,
  anticipo_tipo, anticipo_valor, validez_dias, condiciones, siguiente_numero, montos_desabollado,
  combos, actualizado_en
) ON talleres TO taller_app;

-- Down Migration

REVOKE UPDATE (
  nombre, logo_key, direccion, telefono, datos_transferencia, tarifa_pintura, margen_repuestos_pct,
  anticipo_tipo, anticipo_valor, validez_dias, condiciones, siguiente_numero, montos_desabollado,
  combos, actualizado_en
) ON talleres FROM taller_app;
GRANT UPDATE ON talleres TO taller_app;
