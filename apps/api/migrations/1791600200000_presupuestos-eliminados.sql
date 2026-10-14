-- Up Migration

-- Eliminacion logica de presupuestos: "eliminar" lo oculta de la app pero queda guardado (cuando y
-- quien), asi se puede revisar lo que se le envio a un cliente y el numero nunca se reutiliza.
-- eliminado_por es NULL si lo elimino el administrador de la APP (no es usuario del taller).
ALTER TABLE presupuestos
  ADD COLUMN eliminado_en timestamptz,
  ADD COLUMN eliminado_por uuid,
  ADD CONSTRAINT presupuestos_eliminado_por_fk FOREIGN KEY (eliminado_por, taller_id) REFERENCES usuarios (id, taller_id);

-- La lista de la app muestra solo los vigentes, del numero mas alto al mas bajo.
CREATE INDEX presupuestos_vigentes ON presupuestos (taller_id, numero DESC) WHERE eliminado_en IS NULL;

-- Down Migration

DROP INDEX presupuestos_vigentes;
ALTER TABLE presupuestos
  DROP CONSTRAINT presupuestos_eliminado_por_fk,
  DROP COLUMN eliminado_por,
  DROP COLUMN eliminado_en;
