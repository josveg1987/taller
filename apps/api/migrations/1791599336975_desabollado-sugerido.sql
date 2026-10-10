-- Up Migration

-- Desabollado sugerido por pieza (opcional). Al reparar una pieza en un presupuesto, el monto de
-- desabollado parte con este valor y se puede editar; NULL = sin sugerencia (se elige un monto rapido).
-- Es solo un punto de partida: el desabollado real depende del dano de cada auto.
ALTER TABLE piezas ADD COLUMN desabollado_sugerido integer CHECK (desabollado_sugerido >= 0);

-- Down Migration

ALTER TABLE piezas DROP COLUMN desabollado_sugerido;
