-- Up Migration

-- Plazo estimado de todo el trabajo, en dias habiles (opcional: NULL = sin plazo indicado).
ALTER TABLE presupuestos ADD COLUMN plazo_dias integer CHECK (plazo_dias BETWEEN 1 AND 365);

-- Down Migration

ALTER TABLE presupuestos DROP COLUMN plazo_dias;
